const { deepStrictEqual } = require('assert');
const crypto = require('crypto');
const { ipcRenderer } = require('electron');
const JsonDB = require('node-json-db');
const QRCode = require('qrcode');
const shell = require('electron').shell;

const socket = io.connect('http://127.0.0.1:22103');
const secKey = crypto.randomBytes(20).toString('hex');
const wallet_db = new JsonDB("wallet", true, true);
const settings_db = new JsonDB("settings", true, true);

const version = "1.0.0";

let allTransactions;
let globalFormatter;
let pricePerSNWinBTC;
let pricePerSNW;
let coinGeckoBtc;
let tokenCostPrice;
let allTokensArr;
let allTokensBalancesArr;
let coinBalanceObj;
let walletAddressGlobal;
let sfpConnection = false;

const tokensListDom = document.getElementById('tokensList').getElementsByTagName('tbody')[0];
const myTokensListDom = document.getElementById('myTokenList').getElementsByTagName('tbody')[0];

const sendTxModal = new bootstrap.Modal(document.getElementById('sendTxModal'));
const createTokenModal = new bootstrap.Modal(document.getElementById('createTokenModal'));
const mintTokenModal = new bootstrap.Modal(document.getElementById('mintTokenModal'));

/* Minimizing animation and action */
$('#minWindow').on('click', function () {
	if ($('#body').css('opacity') == 0) $('#form').css('opacity', 1);
	else $('#body').css('opacity', 0);

	setTimeout(() => {
		ipcRenderer.send('minimize');
		$('#body').css('opacity', 1);
	}, 250);
});

/* Exit animation and action */
$('#closeWindow').on('click', function () {
	if ($('#body').css('opacity') == 0) $('#form').css('opacity', 1);
	else $('#body').css('opacity', 0);
	socket.emit('exitApp', { key: secKey });

	setTimeout(() => {
		ipcRenderer.postMessage('exit');
	}, 250);
});


$(document).ready(function() {
	/* Switch nodes in daemon */
	setTimeout(() => {
		socket.emit('switchNode', {
			key: secKey,
			daemonAddress: settings_db.getData('/daemon_address'),
			sfpAddress: settings_db.getData('/sfp_address')
		});
	}, 1000);
});


/* main() */
async function main() {
	/* Set default settings values */
	try {
		settings_db.getData('/currency');
		settings_db.getData('/sounds');
		settings_db.getData('/daemon_address');
		settings_db.getData('/sfp_address');
    settings_db.getData('/dark_mode');
	} catch(e) {
		settings_db.push('/currency', 'USD');
		settings_db.push('/sounds', true);
		settings_db.push('/daemon_address', 'snowflake-net.com:22101');
		settings_db.push('/sfp_address', 'snowflake-net.com:22104');
		settings_db.push('/dark_mode', false);
	}

	try {
		wallet_db.getData('/sfp_activated');
	} catch(e) {
		wallet_db.push('/sfp_activated', false);
	}
	
	/* Send security key to server */	
	socket.emit('getSecKey', {
		key: secKey
	});

	/* Get tokens, mytokes and balances from SFP node */
	refreshTokensAndBalance();

	

	/* If wallet is not activated, activate it */
	if(wallet_db.getData("/sfp_activated") == false) {
		socket.emit('sfpActivateWallet', {
			key: secKey
		});
	}

	/* Get all transactions from Snowflake Wallet */
	socket.emit('getTransactions', {
		key: secKey
	});

	/* Get current connection status */
	socket.emit("getConnectionStatus");

	/* Set settings values */
	if(settings_db.getData('/sounds')) { document.getElementById('soundSwitcher').checked = true; }
	if(settings_db.getData('/dark_mode')) { 
		document.getElementById('darkModeSwitcher').checked = true;
		document.getElementById('darkModeCSS').href = `css/style_dark.css`;
	}
	document.getElementById('sfpNodeAddress').value = settings_db.getData('/sfp_address');
	document.getElementById('daemonAddress').value = settings_db.getData('/daemon_address');

	/* Get market data from coinpaprika */
	let coinPaprikaReq = await fetch(`https://api.coinpaprika.com/v1/coins/snw-snowflake-network/ohlcv/today?quote=btc`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
	});
	let coinPaprika = await coinPaprikaReq.json();
	try {
		pricePerSNWinBTC = parseFloat(coinPaprika[0].close);
	} catch(e) {
		pricePerSNWinBTC = 0;
	}

	/* Get current currency */
	document.getElementById('currencySelector').value=settings_db.getData('/currency');
	globalFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: settings_db.getData('/currency'),
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	let coinGeckoBtcReg = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
	});
	coinGeckoBtc = await coinGeckoBtcReg.json();
	pricePerSNW = (coinGeckoBtc.market_data.current_price[settings_db.getData('/currency').toLowerCase()] * pricePerSNWinBTC).toFixed(3);


	/* Get token create price every minute */
	function getTokenPrice() { socket.emit("sfpTokenPrice", { key: secKey }); }
	setInterval(() => {
		getTokenPrice()
	}, 60 * 1000);
	getTokenPrice();

	/* Get balance every 15 seconds 
	 * Also check connection */
	setInterval(() => {
		/* Get balance */
		socket.emit('getBalances');

		/* Check connection every 15 seconds */
		socket.emit("getConnectionStatus");

		/* Check SFP Balances if connected to SFP node */
		if(sfpConnection) {
			socket.emit('sfpGetBalances', { key: secKey });
			socket.emit("sfpTokenPrice", { key: secKey });
		}
	}, 15 * 1000);
	socket.emit('getBalances');

	/* Save wallet every 60 seconds */
	setInterval(() => {
		socket.emit('saveWallet');
	}, 60 * 1000);
}
main();



socket.on('switchNode', (data) => {
	/* Activate Wallet */
	socket.emit('sfpActivateWallet', {
		key: secKey
	});

	/* Get tokens, mytokes and balances from SFP node */
	refreshTokensAndBalance();

	setTimeout(() => {
		socket.emit("getTransactions", { key: secKey });
	}, 1000);
});

socket.on('sendLog', (data) => {
	console.log(data);
});

/* Get wallet address */
socket.on('getWalletAddress', (data) => {
	walletAddressGlobal = data.address;
	/* Create QR code */
	QRCode.toDataURL(data.address, function (err, url) {
		document.getElementById('qrCanvas').innerHTML = `<div class='crop'><img src='${url}'></div>`;
	});
	document.getElementById('walletAddress').value = data.address;
});

/* Get private keys */
socket.on('getPrivKeys', async (data) => {
	// TODO: Add private keys handler
});

/* Get balance */
socket.on('getBalances', (data) => {
	/* Make coin balance global */
	coinBalanceObj = {
		balance: data.unlockedBalance,
		locked: data.lockedBalance
	};

	/* Set balance for Snowflake on send page if it has been selected */
	let tokenCoinListDom = document.getElementById('tokenCoinList');
	if(tokenCoinListDom.options[tokenCoinListDom.selectedIndex].value == "SnowflakeSNW") {
		document.getElementById('sendingName').innerHTML = `Snowflake (SNW)`;
		document.getElementById('sendingBalance').innerHTML = `${parseInt((coinBalanceObj.balance).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) + decimalFont((coinBalanceObj.balance).split('.')[1])}`;
		document.getElementById('sendingTicker').innerHTML = `SNW`;
	}

	document.getElementById('unlockedBalance').innerHTML =
		"<img src='images/snw_white.png' class='balanceLogo' id='snw'><span style='margin-left:1px;'>" + data.unlockedBalance + ' SNW</span>';
	document.getElementById('lockedBalance').innerHTML = "<img src='images/snw_white.png' class='balanceLogo2' id='snw'>" + data.lockedBalance + ' SNW';
});

/* Get all transactions */
socket.on('getTransactions', async (data) => {
	allTransactions = data;
	let coinPaprikaReq = await fetch(`https://api.coinpaprika.com/v1/coins/snw-snowflake-network/ohlcv/today?quote=btc`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
	});
	let coinPaprika = await coinPaprikaReq.json();
	
	try {
		pricePerSNWinBTC = parseFloat(coinPaprika[0].close);
	} catch(e) {
		pricePerSNWinBTC = 0;
	}
	
	
	let coinGeckoBtcReg = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
	});
	coinGeckoBtc = await coinGeckoBtcReg.json();
	pricePerSNW = (coinGeckoBtc.market_data.current_price[settings_db.getData('/currency').toLowerCase()] * pricePerSNWinBTC).toFixed(3);
	refreshTransactionsFrontend();
});

/* Get new transaction */
socket.on('getNewTransaction', async (data) => {
	allTransactions.push(data);

	try {
		let coinPaprikaReq = await fetch(`https://api.coinpaprika.com/v1/coins/snw-snowflake-network/ohlcv/today?quote=btc`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
		});
		let coinPaprika = await coinPaprikaReq.json();
		pricePerSNWinBTC = parseFloat(coinPaprika[0].close);
	} catch(e) {
		pricePerSNWinBTC = 0;
	}

	try {
		let coinGeckoBtcReg = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin`, {
			"method": "GET",
			"headers": {
				"Content-Type": "application/json"
			}
		});
		coinGeckoBtc = await coinGeckoBtcReg.json();
		pricePerSNW = (coinGeckoBtc.market_data.current_price[settings_db.getData('/currency').toLowerCase()] * pricePerSNWinBTC).toFixed(3);
	} catch(e) {
		pricePerSNW = 0;
	}

	/* If transaction is positive */
	if(data.transfers[0].amount > 0) {
		/* Play sound (if enabled) */
		if(settings_db.getData('/sounds')) {
			var audio = new Audio('sounds/inc_tx.mp3');
			audio.play();
		}
	}
	
	/* Get tokens, mytokes and balances from SFP node */
	refreshTokensAndBalance();

	/* Refresh frontend */
	refreshTransactionsFrontend();
});

/* Get daemon connection status */
socket.on('daemonConnection', (data) => {
	const daemonStatus = document.getElementById('daemonStatus');
	if(data) {
		daemonStatus.classList.remove('bg-secondary');
		daemonStatus.innerHTML = `Daemon Connected`;
	} else {
		daemonStatus.classList.add('bg-secondary');
		daemonStatus.innerHTML = `Daemon Disconnected`;
	}
});

/* Get SFP connection status */
socket.on('sfpConnection', (data) => {
	const sfpStatus = document.getElementById('sfpStatus');
	if(data) {
		sfpStatus.classList.remove('bg-secondary');
		sfpStatus.innerHTML = `SFP Connected`;
		
		/* If reconnected */
		if(sfpConnection == false) {
			refreshTokensAndBalance();
			socket.emit('getTransactions', { key: secKey });
		}

		/* Set sfp connection to connected */
		sfpConnection = true;
	} else {
		sfpStatus.classList.add('bg-secondary');
		sfpStatus.innerHTML = `SFP Disconnected`;
		
		/* If connection lost */
		if(sfpConnection == true) {
			refreshTokensAndBalance();
			socket.emit('getTransactions', { key: secKey })
		}
		
		/* Set sfp connection to disconnected */
		sfpConnection = false;
	}
});

/* Get current syncing status */
socket.on('getSyncStatus', (data) => {
	const syncingHeightSync = document.getElementById('syncingHeightSync');
	const networkHeightSync = document.getElementById('networkHeightSync');

	/* If syncing is done, change popup color */
	if(data.syncingHeightSync >= data.networkHeightSync) {
		daemonSyncDom.classList.add('done');
	} else {
		daemonSyncDom.classList.remove('done');
	}

	/* Check if values are the same, else don't update */
	if(data.syncingHeightSync.toLocaleString('en-US', { minimumFractionDigits: 0 }) !== syncingHeightSync.innerHTML) {
		syncingHeightSync.innerHTML = data.syncingHeightSync.toLocaleString('en-US', { minimumFractionDigits: 0 });
	}

	/* Check if values are the same, else don't update */
	if(data.networkHeightSync.toLocaleString('en-US', { minimumFractionDigits: 0 }) !== networkHeightSync.innerHTML) {
		networkHeightSync.innerHTML = data.networkHeightSync.toLocaleString('en-US', { minimumFractionDigits: 0 });
	}
});

/* Get send transaction result */
socket.on('sendTransaction', (data) => {
	if(data.status == "error") {
		notify(data.message, 'error', 3);
	} else if(data.status == "success") {
		/* Play audio if enabled */
		if(settings_db.getData('/sounds')) {
			var audio = new Audio('sounds/send.mp3');
			audio.play();
		}

		document.getElementById('sendingBalance').innerHTML = (parseFloat(document.getElementById('sendingBalance').innerHTML.replace(/\,/g, "")) - parseFloat(document.getElementById('sendAmount').value)).toLocaleString('en-US');

		notify(`Transaction has been sent<br>${data.hash.match(/.{1,32}/g)[0]}<br>${data.hash.match(/.{1,32}/g)[1]}`, '', 3);
	}
});



/* SFP: Activate wallet address for SFP */
socket.on('sfpActivateWallet', async (data) => {
	/* If wallet is already activated */
	if(data.activation_success) {
		wallet_db.push("/sfp_activated", true);
	} else {
	}
});

/* SFP: Get all tokens */
socket.on('sfpGetTokens', async (data) => {
	/* Empty token coin list */
	let tokenCoinListDom = document.getElementById('tokenCoinList');
	tokenCoinListDom.innerHTML = '';
	tokensListDom.innerHTML = '';

	/* Add Snowflake (SNW) */
	let tokenAdd = document.createElement("option");
	tokenAdd.text = `Snowflake (SNW)`;
	tokenAdd.value = `SnowflakeSNW`;
	tokenCoinListDom.add(tokenAdd);

	/* Make all tokens global */
	allTokensArr = data.tokens;
	
	let tokensC = 0;
	
	for (let tokenD in data.tokens) {
		tokensC++;

		let token = data.tokens[tokenD];

		const row = tokensListDom.insertRow();

		const tokenName = row.insertCell();
		tokenName.innerHTML = `${token.name} (${token.ticker})`;

		const balance = row.insertCell();
		balance.innerHTML = `<span id="${tokenD}_bal">0</span> ${token.ticker}`;

		const lockedBalance = row.insertCell();
		lockedBalance.innerHTML = `<span id="${tokenD}_lbal">0</span> ${token.ticker}`;

		const supply = row.insertCell();
		supply.innerHTML = `${parseInt((token.max_supply / (10**token.decimals))).toLocaleString('en-US')} ${token.ticker}`;

		const circulatingSupply = row.insertCell();
		circulatingSupply.innerHTML = `<span id="${tokenD}_cirsup">${parseInt((token.circulating_supply / (10**token.decimals))).toLocaleString('en-US')}</span> ${token.ticker}`;

		const price = row.insertCell();
		price.innerHTML = `-`;

		const marketcap = row.insertCell();
		marketcap.innerHTML = `-`;

		const change24h = row.insertCell();
		change24h.innerHTML = `-`;

		const actions = row.insertCell();
		actions.style.paddingTop = '5px';
		actions.style.paddingBottom = '0px';
		/*actions.innerHTML = `
		<button class='btn btn-theme' style='padding-top: 0px; padding-bottom: 0px; padding-left: 5px; padding-right: 5px;'>
			<i class="fas fa-plus"></i>
		</button>
		`;*/

		let tokenAdd = document.createElement("option");
		tokenAdd.text = `${token.name} (${token.ticker})`;
		tokenAdd.value = `${token.hash.replace(/[^a-zA-Z0-9]/gi,'')}`;
		tokenCoinListDom.add(tokenAdd);
	}
	
	if(tokensC == 0) {
		document.getElementById('noTokensAlert').style.display = 'flex';
	} else {
		document.getElementById('noTokensAlert').style.display = 'none';
	}
});

/* SFP: Get all tokens balances */
socket.on('sfpGetBalances', async (data) => {
	/* Make balances public */
	allTokensBalancesArr = data.tokens;

	for(token in data.tokens) {
		try {
			document.getElementById(`${token}_bal`).innerHTML = `${parseFloat(data.tokens[token].balance / (10**data.tokens[token].decimals)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: data.tokens[token].decimals })}`;
			document.getElementById(`${token}_lbal`).innerHTML = `${parseFloat(data.tokens[token].locked_balance / (10**data.tokens[token].decimals)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: data.tokens[token].decimals })}`;
		} catch(e) { }

		try {
			document.getElementById(`${token}_myBal`).innerHTML = `${parseFloat(data.tokens[token].balance / (10**data.tokens[token].decimals)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: data.tokens[token].decimals })}`;
			document.getElementById(`${token}_myLbal`).innerHTML = `${parseFloat(data.tokens[token].locked_balance / (10**data.tokens[token].decimals)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: data.tokens[token].decimals })}`;
		} catch(e) { }
	}
})

/* SFP: Get token create price */
socket.on('sfpTokenPrice', async (data) => {
	tokenCostPrice = data.price;
	document.getElementById('tokenPrice').innerHTML = data.price;
});

/* SFP: Get all my tokens */
socket.on('sfpGetMyTokens', async (data) => {
	myTokensListDom.innerHTML = '';
	let tokensC = 0;

	for (let tokenD in data.tokens) {
		let token = data.tokens[tokenD];
		tokensC++;

		const row = myTokensListDom.insertRow();

		const tokenName = row.insertCell();
		tokenName.innerHTML = `${token.name} (${token.ticker})`;

		const balance = row.insertCell();
		balance.innerHTML = `<span id="${tokenD}_myBal">0</span> ${token.ticker}`;

		const lockedBalance = row.insertCell();
		lockedBalance.innerHTML = `<span id="${tokenD}_myLbal">0</span> ${token.ticker}`;

		const supply = row.insertCell();
		supply.innerHTML = `${parseInt((token.max_supply / (10**token.decimals))).toLocaleString('en-US')} ${token.ticker}`;

		const circulatingSupply = row.insertCell();
		circulatingSupply.innerHTML = `<span id="${tokenD}_cirsup">${parseInt((token.circulating_supply / (10**token.decimals))).toLocaleString('en-US')}</span> ${token.ticker}`;

		const price = row.insertCell();
		price.innerHTML = `-`;

		const marketcap = row.insertCell();
		marketcap.innerHTML = `-`;

		const change24h = row.insertCell();
		change24h.innerHTML = `-`;

		const actions = row.insertCell();
		actions.style.paddingTop = '5px';
		actions.style.paddingBottom = '0px';
		actions.innerHTML = (token.mineable == false ? `
		<button class='btn btn-theme' style='padding-top: 3px; padding-bottom: 3px; padding-left: 8px; padding-right: 8px; font-size:13px' onclick='mintToken("${token.hash}")'>
			Mint
		</button>
		` : '');
	}

	if(tokensC == 0) {
		document.getElementById('noMyTokensAlert').style.display = 'flex';
	} else {
		document.getElementById('noMyTokensAlert').style.display = 'none';
	}
});

/* SF{: Get transaction fee */
socket.on('sfpTxFee', async (data) => {
	document.getElementById('sendFeeAmount').value = (data.fee / (10**8));
});

/* SFP: Create token response */
socket.on('sfpCreateToken', async (data) => {
	if(data.status == "error") {
		notify(data.message, 'error', 3);
	} else if(data.status == "ok") {
		notify(data.message, '', 3);
	}
});

/* SFP: Mint tokens response */
socket.on('sfpMintTokens', async (data) => {
	if(data.success) {
		notify("Minting done. Waiting for transaction confirmations.", "", 3);
		refreshTokensAndBalance();
	} else {
		notify("Cannot create more tokens than maximum supply.", "error", 3);
	}
});



/* setInterval for updating transaction timestamps (30 seconds) */
let timersArr = [];
setInterval(() => {
	for(let i = 0; i < timersArr.length; i++) {
		document.getElementById('timestamp' + timersArr[i].number).innerHTML = prettyDate(timersArr[i].timestamp);
	}
}, 30 * 1000);


/* Open 'details' for coin transactions*/
function openDetails(dom, thisDom) {
	if(thisDom.classList.value.includes('hoverTxC')) {
		thisDom.classList.remove('hoverTxC');
	} else {
		thisDom.classList.add('hoverTxC');
	}

	for(tx in txArr) {

		if(dom.id !== `txDetails${tx}`) {
			document.getElementById(`txDetails${tx}`).classList.add('d-none');
			document.getElementById(`txDetailsBtn${tx}`).classList.remove('hoverTxC');
		}
	}

	if(dom.classList.value.includes('d-none')) {
		dom.classList.remove('d-none')
	} else {
		dom.classList.add('d-none')
	}
}

function decimalFont(input, alwaysShow, decimals) {
	if(alwaysShow == true) {
		if(input == 0) {
			if(decimals == 0) { return ""; } else {
				return "<font style='color:#A7CDFF!important;'>." + (1 * (10**decimals)).toString().substring(1) + "</font>&nbsp;";
			}
		} else {
			return "<font style='color:#A7CDFF!important;'>." + input + "</font>&nbsp;";
		}
	} else {
		if(input == 0) {
			return "";
		} else {
			return "<font style='color:#A7CDFF!important;'>." + input + "</font>&nbsp;";
		}
	}
	
}

/* Refresh transactions list */
let txArr = [];
function refreshTransactionsFrontend() {
	/* Sort all transactions on block height (high to low) */
	allTransactions.sort(function (a, b) {
		return b.blockHeight - a.blockHeight;
	});

	/* Pagination */
	$('#pagination-container').pagination({
		dataSource: allTransactions,
		pageSize: 13,
		callback: function (response, pagination) {
			let dataHtml = `<div class="row mx-0">`;
			let txC = 0;
			txArr = [];
			timersArr = [];

			if(response.length == 0) {
				dataHtml += `
				<div class="alert alert-primary custom-alert" role="alert">
					You currently have no transactions
				</div>
				`;
				/* Hide pagination pages if there are no transactions */
				document.getElementById('paginationjs-pages').style.display = "none";
			} else {
				/* Only show pagination pages when there are 13 transactions in the list */
				if(allTransactions.length < 13) {
					document.getElementById('paginationjs-pages').style.display = "none";
				}
			}

			for (const tx of response) {
        const { month, day } = timestampDate(tx.timestamp);
				let txSent;

				for (const transfer of tx.transfers) {
					if (!transfer.amount == 0) {
						if (transfer.amount < 0) {
							txSent = true;
						} else if (transfer.amount > 0) {
							txSent = false;
						}
					}

          if (!transfer.amount == 0) {
						let momTx = moment.unix(tx.timestamp);
						
						dataHtml += `
						<div class="col-12 px-0 hoverTx" onclick="openDetails(document.getElementById('txDetails${txC}'), this)" id="txDetailsBtn${txC}">
							<div class="d-inline-flex">
								<center class="fw-bold" style="width:40px;">
									${month}<br>
									${day}
								</center>
							</div>

							<div class="d-inline-flex" style="margin-left:10px; width:35px;">
								<span class="fw-bold">
									${txSent ? `<i class="fal fa-inbox-out"></i>` : `<i class="fal fa-inbox-in"></i>`}
								</span>
							</div>

							<div class="d-inline-flex">
								<span class="fw-bold">${txSent ? 'Sent' : 'Recieved'}</span>&nbsp;${(prettyDate(tx.timestamp) == "" ? '' : `<span id='timestamp${txC}'>${prettyDate(tx.timestamp)}</span>`)}
							</div>

							<div style="margin-top: -20px;">
								<span class="d-flex justify-content-end fw-bold balanceNo" style="position: relative; top: -10px; right:4px;">
									${(
										(tx.token_hash == "" ?
											transfer.amount : 
											(tx.token_to_address == walletAddressGlobal ?
												tx.token_amount :
												-Math.abs(tx.token_amount)
											)
										) > 0 ?
											'+' :
											''
									) + 
									parseInt((
										(tx.token_hash == "" ?
											transfer.amount :
											(tx.token_to_address == walletAddressGlobal ?
												tx.token_amount :
												-Math.abs(tx.token_amount)
											)
										) /
										(10 ** 
											(tx.token_hash == "" ?
												8 :
												allTokensArr[tx.token_hash].decimals
											)
										)
									).toFixed(8).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) +
									
									(tx.token_hash == "" ?
										decimalFont(
											(
												(tx.token_hash == "" ?
													transfer.amount :
													tx.token_amount
												) /
												(10 **
													(tx.token_hash == "" ?
														8 :
														allTokensArr[tx.token_hash].decimals
													)
												)
											).toFixed(
												(tx.token_hash == "" ?
													8 :
													allTokensArr[tx.token_hash].decimals
												)
											).split('.')[1]
										) :
										(allTokensArr[tx.token_hash].decimals == 0 ? '' : 
											decimalFont(
												(
													(tx.token_hash == "" ?
														transfer.amount :
														tx.token_amount
													) /
													(10 **
														(tx.token_hash == "" ?
															8 :
															allTokensArr[tx.token_hash].decimals
														)
													)
												).toFixed(
													(tx.token_hash == "" ?
														8 :
														allTokensArr[tx.token_hash].decimals
													)
												).split('.')[1]
											)
										)
									)
								}
									
									${(tx.token_hash == "" ? "SNW" : allTokensArr[tx.token_hash].ticker)}
								</span>
							</div>
						</div>
						<div class="col-12 px-0 d-none" id="txDetails${txC}">
							<div class="detailsTx">
								<h5 style="font-weight: bold; font-size:14px;">Details</h5>
									<div style="display:flex">
										<div class="detailsNames">
											Transaction Hash:<br>
											Payment ID:<br>
											Height:<br>
											Amount:<br>
											Fee:<br>
											Creation Time:
										</div>
										<div style="">
											<a href="#" class="linkStyle" onclick="shell.openExternal('https://explorer.snowflake-net.com/transaction.html?hash=${(tx.token_hash == "" ? tx.hash : tx.paymentID)}')">${(tx.token_hash == "" ? tx.hash : tx.paymentID)}</a><br>
											${(tx.paymentID == "" ? '-' : (tx.token_hash == "" ? tx.paymentID : '-'))}<br>
											${tx.blockHeight.toLocaleString('en-US')}<br>
											<span class="balanceNo" style="font-weight:bold;">${((tx.token_hash == "" ? transfer.amount : tx.token_amount) > 0 ? '+' : '') + parseInt(((tx.token_hash == "" ? transfer.amount : tx.token_amount) / (10 ** (tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals) )).toFixed((tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals)).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) + (tx.token_hash == "" ? decimalFont(((tx.token_hash == "" ? transfer.amount : tx.token_amount) / (10 ** (tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals) )).toFixed((tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals)).split('.')[1]) : (allTokensArr[tx.token_hash].decimals == 0 ? '' : decimalFont(((tx.token_hash == "" ? transfer.amount : tx.token_amount) / (10 ** (tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals) )).toFixed((tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals)).split('.')[1])) )} ${(tx.token_hash == "" ? "SNW" : allTokensArr[tx.token_hash].ticker)} ${(tx.token_hash == "" ? `<span class="fiatPrice">(${globalFormatter.format(Math.abs(parseFloat(pricePerSNW) * (transfer.amount / (10 ** (tx.token_hash == "" ? 8 : allTokensArr[tx.token_hash].decimals) ))))})</span>` : '')} <br></span>
											<span class="balanceNo" style="font-weight:bold;">${(tx.fee / (10 ** 8)).toFixed(8).split('.')[0] + decimalFont((tx.fee / (10 ** 8)).toFixed(8).split('.')[1])} SNW<br></span>
											${momTx.format('YYYY-MM-DD hh:mm A')}<br>
										</div>
									</div>
							</div>
						</div>
						<hr style="color:#C1C1C1; margin-bottom: 0px;">`;

						if(prettyDate(tx.timestamp) !== "") {
							timersArr.push({
								number: txC,
								timestamp: tx.timestamp
							});
						}
						txArr.push(txC);
						txC++;
          }
				}
			}

			dataHtml += '</div>';

			$('#pagination-container').prev().html(dataHtml);
		}
	});
}

/* Parse amounts */
const isDecimalKey = (element)=>{
	const str=element.value;
	const result = str.replace(/[^\d.]|\.(?=.*\.)/g, '');
	// /^\d*(\.(\d{1,8}?)?)?$/
	element.value=result;
}

/* Set notification */
function notify(message, type, seconds) {
  document.getElementById('notify-message').style.opacity = '1';
	document.getElementById('notify-message-text').innerHTML = message;

	if(type == 'error') {
		document.getElementById('notify-message').classList.add('notify-message-error');
		document.getElementById('notify-message-type-icon').classList = "fas fa-exclamation";
		document.getElementById('notify-message-type').innerHTML = "Error";
	} else if(type == 'update') {
		document.getElementById('notify-message').classList.remove('notify-message-error');
		document.getElementById('notify-message-type-icon').classList = "fas fa-download";
		document.getElementById('notify-message-type').innerHTML = "Update";
	} else {
		document.getElementById('notify-message').classList.remove('notify-message-error');
		document.getElementById('notify-message-type-icon').classList = "fas fa-info";
		document.getElementById('notify-message-type').innerHTML = "Info";
	}
	

  /* Remove notification after 3 seconds */
  setTimeout(() => {
    document.getElementById('notify-message').style.opacity = '0';
  }, seconds * 1000);
}

/* Hide notification (onclick) */
function hideNotify(dom) {
  document.getElementById('notify-message').style.opacity = '0';
}

/* Send transaction */
function sendTx() {
	const sendWalletAddressDom = document.getElementById('sendWalletAddress');
	const sendPaymentIDDom = document.getElementById('sendPaymentID');
	const sendFeeAmountDom = document.getElementById('sendFeeAmount');
	const sendAmountDom = document.getElementById('sendAmount');
	const sendTxCoinTokenDom = document.getElementById('sendTxCoinToken');

	/* Check if wallet address is valid */
	if(sendWalletAddressDom.value.length == 98 && sendWalletAddressDom.value.startsWith("SNW")) {} else {
		notify("Wallet address is invalid", 'error', 3);
		return;
	}

	/* Check if payment id is valid */
	if(sendPaymentIDDom.value !== "") {
		if(sendPaymentIDDom.value.length == 64 && /^[A-Fa-f0-9]*$/.test(sendPaymentIDDom.value)) {} else {
			notify("PaymentID is invalid", 'error', 3);
			return;
		}
	}

	/* Check if fee amount is minimum of 0.00005 SNW */
	if(parseFloat(sendFeeAmountDom.value) >= 0.00005) {} else {
		notify("Fee amount can't be lower than 0.00005 SNW", 'error', 3);
		return;
	}

	/* Check if fee amount is minimum of 0.00005 SNW */
	if(parseFloat(sendAmountDom.value) > 0) {} else {
		notify("Amount can't be 0", 'error', 3);
		return;
	}

	document.getElementById('sendTxFee').innerHTML = `${parseFloat(sendFeeAmountDom.value)}`;
	document.getElementById('sendTxAmount').innerHTML = `${parseFloat(sendAmountDom.value).toLocaleString('en-us')} ${(sendTxCoinTokenDom.innerHTML == "Snowflake (SNW)" ? 'SNW' : sendTxCoinTokenDom.innerHTML.split(' (')[1].slice(0, -1))}`;
	document.getElementById('sendTxTotal').innerHTML = `${(sendTxCoinTokenDom.innerHTML == "Snowflake (SNW)" ? parseFloat(sendAmountDom.value).toLocaleString('en-us') + " SNW + " + parseFloat(sendFeeAmountDom.value) : parseFloat(sendFeeAmountDom.value) + " SNW + " + parseFloat(sendAmountDom.value).toLocaleString('en-us'))} ${(sendTxCoinTokenDom.innerHTML == "Snowflake (SNW)" ? 'SNW' : sendTxCoinTokenDom.innerHTML.split(' (')[1].slice(0, -1))}`;
	
	sendTxModal.show();
}

function sendTxConfirm() {
	const tokenCoinListDom = document.getElementById('tokenCoinList');
	const sendWalletAddressDom = document.getElementById('sendWalletAddress');
	const sendAmountDom = document.getElementById('sendAmount');
	const sendPaymentIDDom = document.getElementById('sendPaymentID');
	const sendFeeAmountDom = document.getElementById('sendFeeAmount');

	sendTxModal.hide();
	
	socket.emit('sendTransaction', {
		key: secKey,
		coinToken: tokenCoinListDom.value,
		address: sendWalletAddressDom.value,
		amount: sendAmountDom.value,
		paymentID: sendPaymentIDDom.value,
		feeAmount: sendFeeAmountDom.value
	});

	/* Get all SFP tokens balances */
	socket.emit('sfpGetBalances', { key: secKey });
}

/* Set currency */
function currencyChange(dom) {
	try {
		settings_db.push('/currency', dom.options[dom.selectedIndex].value);
	} catch(e) {
	}

	globalFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: dom.options[dom.selectedIndex].value,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	pricePerSNW = (coinGeckoBtc.market_data.current_price[settings_db.getData('/currency').toLowerCase()] * pricePerSNWinBTC).toFixed(3);
	refreshTransactionsFrontend();
}

function changeSounds(dom) {
	if(dom.checked) {
		settings_db.push('/sounds', true);
	} else {
		settings_db.push('/sounds', false);
	}
}

function resyncWallet() {
	notify("Wallet is resyncing...", '', 3)
	socket.emit('resyncWallet', { key: secKey })
}

function resetWallet() {
	notify("Wallet is resyncing...", '', 3)
	socket.emit('resetWallet', { key: secKey })
}

function rewindWallet() {
	notify("Wallet is rewinding 1000 blocks...", '', 3)
	socket.emit('rewindWallet', { key: secKey })
}

function switchSFP() {
  notify("Switching SFP Node...", '', 3)
	socket.emit('switchNode', {
		key: secKey,
		sfpAddress: document.getElementById('sfpNodeAddress').value
	})
  settings_db.push('/sfp_address', document.getElementById('sfpNodeAddress').value);
	socket.emit("getConnectionStatus");
}

function switchDaemon() {
  notify("Switching Daemon...", '', 3)
  socket.emit('switchNode', {
		key: secKey,
		daemonAddress: document.getElementById('daemonAddress').value
	})
  settings_db.push('/daemon_address', document.getElementById('daemonAddress').value);
	socket.emit("getConnectionStatus");
}

function changeDarkMode(dom) {
	if(dom.checked) {
		settings_db.push('/dark_mode', true);
		document.getElementById('darkModeCSS').href = `css/style_dark.css`;
	} else {
		settings_db.push('/dark_mode', false);
		document.getElementById('darkModeCSS').href = `css/style_darkno.css`;
	}
}

async function checkUpdate() {
	let getUpdateGithub = await fetch(`https://api.github.com/repos/Snowflake-coin/snowflake-frost-wallet/releases/latest`, {
		"method": "GET",
		"headers": {
			"Content-Type": "application/json"
		}
	});
	let githubReq = await getUpdateGithub.json();

	if(githubReq.name > version) {
		notify(`<a href="#" onclick="shell.openExternal('${githubReq.html_url}')">v${githubReq.name} is available. Click here to download</a>`, 'update', 10);
	} else {
		notify('No new version available.', '', 3)
	}
}

function createToken() {
	const createTokenNameDom = document.getElementById('createTokenName');
	const createTokenTickerDom = document.getElementById('createTokenTicker');
	const createTokenDecimalsDom = document.getElementById('createTokenDecimals');
	const createTokenSupplyDom = document.getElementById('createTokenSupply');
	const createTokenMinableDom = document.getElementById('createTokenMinable');
	const createTokenTypeDom = document.getElementById('createTokenType');

	if(!(createTokenNameDom.value.length > 4) || !(createTokenNameDom.value.length < 33)) {
		notify('Token Name length is too short', 'error', 3);
		return;
	}

	if(!(createTokenTickerDom.value.length > 2) || !(createTokenTickerDom.value.length < 6)) {
		notify('Ticker length is too short', 'error', 3);
		return;
	}

	if(!(parseInt(createTokenDecimalsDom.value) >= 0) || !(parseInt(createTokenDecimalsDom.value) <= 10)) {
		notify(`Decimals amount is too ${(createTokenDecimalsDom.value < 0 ? 'small' : (createTokenDecimalsDom.value > 10 ? 'big' : '') )}`, 'error', 3);
		return;
	}

	if(!(parseInt(createTokenSupplyDom.value) >= 1) || !(parseInt(createTokenSupplyDom.value) <= 10000000000)) {
		notify(`Maximum supply amount is too ${(createTokenSupplyDom.value < 1 ? 'small' : (createTokenSupplyDom.value > 10000000000 ? 'big' : '') )}`, 'error', 3);
		return;
	}

	if(createTokenTypeDom.options[createTokenTypeDom.selectedIndex].value == "0" || createTokenTypeDom.options[createTokenTypeDom.selectedIndex].value == "1") { } else {
		notify(`Please select a valid Token Type`, 'error', 3);
		return;
	}

	const createTokenNameVb = document.getElementById('createTokenNameVb');
	const createTickerVb = document.getElementById('createTickerVb');
	const createDecimalsVb = document.getElementById('createDecimalsVb');
	const createMaximumSupplyVb = document.getElementById('createMaximumSupplyVb');
	const createMineableVb = document.getElementById('createMineableVb');
	const createTokenTypeVb = document.getElementById('createTokenTypeVb');
	const createPaymentAmountVb = document.getElementById('createPaymentAmountVb');

	createTokenNameVb.innerHTML = createTokenNameDom.value;
	createTickerVb.innerHTML = createTokenTickerDom.value;
	createDecimalsVb.innerHTML = createTokenDecimalsDom.value;
	createMaximumSupplyVb.innerHTML = parseInt(createTokenSupplyDom.value).toLocaleString('en-US', { minimumFractionDigits: 0 });
	createMineableVb.innerHTML = (createTokenMinableDom.checked == true ? 'Yes' : 'No');
	createTokenTypeVb.innerHTML = createTokenTypeDom.options[createTokenTypeDom.selectedIndex].text;
	createPaymentAmountVb.innerHTML = tokenCostPrice;

	createTokenModal.show();
}

function confirmCreateToken() {
	const createTokenNameDom = document.getElementById('createTokenName');
	const createTokenTickerDom = document.getElementById('createTokenTicker');
	const createTokenDecimalsDom = document.getElementById('createTokenDecimals');
	const createTokenSupplyDom = document.getElementById('createTokenSupply');
	const createTokenMinableDom = document.getElementById('createTokenMinable');
	const createTokenTypeDom = document.getElementById('createTokenType');

	createTokenModal.hide();

	socket.emit('sfpCreateToken', {
		token_name: createTokenNameDom.value,
		ticker: createTokenTickerDom.value,
		decimals: parseInt(createTokenDecimalsDom.value),
		max_supply: parseInt(createTokenSupplyDom.value),
		mineable: createTokenMinableDom.checked,
		token_type: createTokenTypeDom.options[createTokenTypeDom.selectedIndex].value
	})
}

function refreshTokensAndBalance() {
	/* Get all SFP tokens */
	socket.emit('sfpGetTokens', { key: secKey });

	/* Get all my SFP tokens */
	socket.emit('sfpGetMyTokens', { key: secKey });

	/* Get all SFP tokens balances */
	socket.emit('sfpGetBalances', { key: secKey });
}

function refreshTokens() {
	refreshTokensAndBalance();
	notify("Token list refreshed!", '', 3);
}

function changeTokenSend(dom) {
	if(dom.options[dom.selectedIndex].value !== "SnowflakeSNW") {
		document.getElementById('sendingName').innerHTML = `${allTokensArr[dom.options[dom.selectedIndex].value].name} (${allTokensArr[dom.options[dom.selectedIndex].value].ticker})`;
		document.getElementById('sendingBalance').innerHTML = `${parseInt((allTokensBalancesArr[dom.options[dom.selectedIndex].value].balance / (10 ** allTokensBalancesArr[dom.options[dom.selectedIndex].value].decimals)).toFixed(8).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) + decimalFont((allTokensBalancesArr[dom.options[dom.selectedIndex].value].balance / (10 ** allTokensBalancesArr[dom.options[dom.selectedIndex].value].decimals)).toFixed(8).split('.')[1], true, allTokensBalancesArr[dom.options[dom.selectedIndex].value].decimals)}`;
		document.getElementById('sendingTicker').innerHTML = `${allTokensArr[dom.options[dom.selectedIndex].value].ticker}`;
		document.getElementById('sendPaymentID').disabled = true;
		document.getElementById('sendFeeAmount').disabled = true;
		socket.emit('sfpTxFee', { key: secKey });
		
		document.getElementById('sendTxCoinToken').innerHTML = `${allTokensArr[dom.options[dom.selectedIndex].value].name} (${allTokensArr[dom.options[dom.selectedIndex].value].ticker})`;
	} else {
		document.getElementById('sendingName').innerHTML = `Snowflake (SNW)`;
		document.getElementById('sendingBalance').innerHTML = `${parseInt((coinBalanceObj.balance).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) + decimalFont((coinBalanceObj.balance).split('.')[1])}`;
		document.getElementById('sendingTicker').innerHTML = `SNW`;
		document.getElementById('sendPaymentID').disabled = false;
		document.getElementById('sendFeeAmount').disabled = false;
		document.getElementById('sendFeeAmount').value = "0.00005";

		document.getElementById('sendTxCoinToken').innerHTML = `Snowflake (SNW)`;
	}
}

function sendAllBal() {
	let dom = document.getElementById('tokenCoinList');
	let fee = document.getElementById('sendFeeAmount');

	if(dom.options[dom.selectedIndex].value !== "SnowflakeSNW") {
		document.getElementById('sendAmount').value = `${(allTokensBalancesArr[dom.options[dom.selectedIndex].value].balance / (10 ** allTokensBalancesArr[dom.options[dom.selectedIndex].value].decimals))}`;
	} else {
		if(coinBalanceObj.balance * (10**8) >= 5000) {
			document.getElementById('sendAmount').value = `${coinBalanceObj.balance - parseFloat(fee.value)}`;
		} else {
			document.getElementById('sendAmount').value = `0`;
		}
	}
}

function mintAllBal() {
	token_hash = document.getElementById('mintingTokenHash').value;
	document.getElementById('mintingAmount').value = `${((allTokensArr[token_hash].max_supply - allTokensArr[token_hash].circulating_supply) / (10 ** allTokensArr[token_hash].decimals))}`;
}

function mintToken(token) {
	document.getElementById('mintTokenName').innerHTML = `${allTokensArr[token].name} (${allTokensArr[token].ticker})`;
	document.getElementById('mintTokenMax').innerHTML = `${parseInt(((allTokensArr[token].max_supply - allTokensArr[token].circulating_supply) / (10 ** allTokensArr[token].decimals)).toFixed(allTokensArr[token].decimals).split('.')[0]).toLocaleString('en-US', { minimumFractionDigits: 0 }) + (allTokensArr[token].decimals == 0 ? '' : decimalFont(((allTokensArr[token].max_supply - allTokensArr[token].circulating_supply) / (10 ** allTokensArr[token].decimals)).toFixed(allTokensArr[token].decimals).split('.')[1]))} ${allTokensArr[token].ticker}`;
	document.getElementById('mintingTokenHash').value = allTokensArr[token].hash;
	mintTokenModal.show();
}

function mintTokenConfirm() {
	let mintingTokenHashDom = document.getElementById('mintingTokenHash');
	let mintingAmountDom = document.getElementById('mintingAmount');

	socket.emit("sfpMintTokens", {
		key: secKey,
		token_hash: mintingTokenHashDom.value,
		amount: parseInt(parseFloat(mintingAmountDom.value) * (10**allTokensArr[mintingTokenHashDom.value].decimals))
	});

	mintTokenModal.hide();

	refreshTokensAndBalance();
}