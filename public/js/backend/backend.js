/* const siphash = require("siphash")

let key = siphash.string16_to_key("2D3C40EF00000000");
let message = "TRANSACTION";
let hash_hex = siphash.hash_hex(key, message);
console.log(hash_hex); */
const crypto = require('crypto');
const { ipcRenderer } = require('electron');
const socket = io.connect('http://127.0.0.1:22103');
const secKey = crypto.randomBytes(20).toString('hex');

const JsonDB = require('node-json-db');
const wallet_db = new JsonDB("wallet", true, true);

let allTransactions;

const tokensListDom = document.getElementById('tokensList').getElementsByTagName('tbody')[0];

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

	setTimeout(() => {
		socket.emit('exitApp', { key: secKey });
		ipcRenderer.postMessage('exit');
	}, 250);
});



async function main() {
	/* Send security key to server */	
	socket.emit('getSecKey', {
		key: secKey
	});

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

	/* Get all SFP tokens */
	socket.emit('sfpGetTokens', {
		key: secKey
	})
}
main();



/* Socket on */
socket.on('getWalletAddress', (data) => {
	/* Get primary address */
	console.log(data.address);
	//document.getElementById('receiveAddress').innerHTML = data.address;
	// TODO: Save wallet address somewhere
});

/* Get private keys */
socket.on('getPrivKeys', async (data) => {
	// TODO: Add private keys handler
});

/* Get address */
socket.on('getBalances', (data) => {
	document.getElementById('unlockedBalance').innerHTML =
		"<img src='images/logo_white.png' class='balanceLogo' id='snw'><span style='margin-left:1px;'>" + data.unlockedBalance + ' SNW</span>';
	document.getElementById('lockedBalance').innerHTML = "<img src='images/logo_white.png' class='balanceLogo2' id='snw'>" + data.lockedBalance + ' SNW';
});

/* Get all transactions */
socket.on('getTransactions', (data) => {
	allTransactions = data;
	refreshTransactionsFrontend();
});

/* Get new transaction */
socket.on('getNewTransaction', (data) => {
	allTransactions.push(data);
	refreshTransactionsFrontend();

	/* Play sound (if enabled) */
	var audio = new Audio('sounds/inc_tx.mp3');
	audio.play();
});



/* Return SFP address activation results */
socket.on('sfpActivateWallet', async (data) => {
	/* Handle results */
	// TODO: Handle results for frontend
	if(data.activation_success) {
		wallet_db.push("/sfp_activated", true);
	} else {
	}
});

socket.on('sfpGetTokens', async (data) => {
	for (let tokenD in data.tokens) {
		let token = data.tokens[tokenD];

		const row = tokensListDom.insertRow();

		const tokenName = row.insertCell();
		tokenName.innerHTML = `${token.name} (${token.ticker})`;

		const balance = row.insertCell();
		balance.innerHTML = `0.00 ${token.ticker}`;

		const supply = row.insertCell();
		supply.innerHTML = `${(token.max_supply / (10**token.decimals)).toFixed(token.decimals)} ${token.ticker}`;

		const circulatingSupply = row.insertCell();
		circulatingSupply.innerHTML = `${(token.circulating_supply / (10**token.decimals)).toFixed(token.decimals)} ${token.ticker}`;

		const price = row.insertCell();
		price.innerHTML = `-`;

		const marketcap = row.insertCell();
		marketcap.innerHTML = `-`;

		const change24h = row.insertCell();
		change24h.innerHTML = `-`;
	}
});


function timestampDate(timestamp) {
	let date = new Date(timestamp * 1000);
	return {
		month: date.toLocaleString('default', { month: 'long' }).substring(0, 3),
		day: date.getDate()
	};
}

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
            dataHtml += `
            <div class="col-12 px-0 hoverTx">
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
                <span class="fw-bold">${txSent ? 'Sent' : 'Recieved'}</span>&nbsp;${prettyDate(tx.timestamp)}
              </div>

              <div style="margin-top: -20px;">
                <span class="d-flex justify-content-end fw-bold" style="color: #5992dd; position: relative; top: -10px; right:4px;">
                  ${(transfer.amount > 0 ? '+' : '') + (transfer.amount / (10 ** 8))} SNW
                </span>
              </div>
            </div>`;
          }
				}
			}

			dataHtml += '</div>';

			$('#pagination-container').prev().html(dataHtml);
		}
	});

	console.log(allTransactions);
}
