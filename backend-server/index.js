const WB = require('turtlecoin-wallet-backend');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const Promise = require('bluebird');

const httpServer = require("http").createServer();
const io = require("socket.io")(httpServer);

const Config = require('./config.js');
const Core = require('./core.js');

const { Logger, setLogSeverity, Severity } = require('./logger');
const { config } = require('process');
const logger = new Logger("WalletBackend");
const logger_sfp = new Logger("SFP-Backend");
setLogSeverity(Severity.TRACE);

const IS_DEVELOPMENT = process.env.NODE_ENV === 'dev';

const daemon = new WB.Daemon(Config.daemonHostname, Config.daemonPort);
let wallet;
let secKey = '';
let allTokensArr = [];
let tokenPriceGlob = 0;
let hashedPrivKey;

(async() => {
  /* Socket requests */
  io.on('connection', async (socket) => {
    /* Get security key */
    socket.on("getSecKey", async data => {
      if(IS_DEVELOPMENT || secKey === '') {
        /* Set security key */
        secKey = data.key;
        
        /* Send wallet address */
        const primaryAddress = await wallet.getPrimaryAddress();
        socket.emit('getWalletAddress', { address: primaryAddress });
        
        const [unlockedBalance, lockedBalance] = await wallet.getBalance();
        socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
      } else {
        /* Disconnect socket if tried to set security key for second time */
        socket.disconnect();
      }
    });

    /* Get balances */
    socket.on("getBalances", async data => {
      const [unlockedBalance, lockedBalance] = await wallet.getBalance();
      socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
    });

    /* Save wallet */
    socket.on("saveWallet", async data => {
      const saved = wallet.saveWalletToFile('./' + Config.walletFilename, '');

      if (!saved) {
        logger.debug(socket, 'Failed to save wallet!');
      } else {
        logger.debug(socket, 'Wallet has been saved!');
      }
    });

    /* Exit the app */
    socket.on("exitApp", async data => {
      if(secKey == data.key) {
        await wallet.saveWalletToFile(Config.walletFilename, '');
        logger.debug(socket, `Wallet saved!`);
        process.exit();
      }
    });

    /* Send transactions to frontend */
    socket.on("getTransactions", async data => {
      if(secKey == data.key) {
        let transactions = await wallet.getTransactions();

        let newTransactions = [];
        /* Add token tx if it exist */
        for(tx in transactions) {
          let newTransfers = [];
          let token_hash = "";
          let token_amount = "";
          let token_to_address = "";

          if(!(transactions[tx].paymentID == "")) {
            let txSFP;
            try {
              txSFP = await Core.sfp_api(`/transaction/${transactions[tx].paymentID}`, '');

              if(txSFP.status == "ok") {
                token_hash = txSFP.result.token_hash;
                token_amount = txSFP.result.amount;
                token_to_address = txSFP.result.to_address;
              }
          
              /* Return connection success */
              socket.emit("sfpConnection", true);
              logger_sfp.debug(io, `Request '/${Config.sfpVersion}/transaction/${transactions[tx].paymentID}' success request`);
            } catch(e) {
              logger_sfp.error(socket, `Request '/${Config.sfpVersion}/transaction/${transactions[tx].paymentID}' failed to SFP Node`);
    
              /* Return connection failed */
              socket.emit("sfpConnection", false);
            }
          }

          for(txs in Object.fromEntries(transactions[tx].transfers)) {
            newTransfers.push({
              amount: Object.fromEntries(transactions[tx].transfers)[txs],
              publicKey: txs
            });
          }

          newTransactions.push({
            transfers: newTransfers,
            hash: transactions[tx].hash,
            fee: transactions[tx].fee,
            blockHeight: transactions[tx].blockHeight,
            timestamp: transactions[tx].timestamp,
            paymentID: transactions[tx].paymentID,
            unlockTime: transactions[tx].unlockTime,
            isCoinbaseTransaction: transactions[tx].isCoinbaseTransaction,
            token_hash: (token_hash == "" ? "" : token_hash),
            token_amount: (token_amount == "" ? "" : token_amount),
            token_to_address: (token_to_address == "" ? "" : token_to_address),
          });
        }
        
        socket.emit('getTransactions', newTransactions);
      }
    });

    /* Get private keys */
    socket.on("getPrivKeys", async data => {
      if(secKey == data.key) {
        const privateViewKey = wallet.getPrivateViewKey();
        const [publicSpendKey, privateSpendKey, err] = await wallet.getSpendKeys(wallet.getAddresses()[0]);

        socket.emit("getPrivKeys", {
          privateViewKey,
          privateSpendKey,
        });
      }
    });

    /* Get connection status */
    socket.on("getConnectionStatus", data => {
      checkProtocols();
    });

    /* Send transaction */
    socket.on("sendTransaction", async data => {
      if(secKey == data.key) {
        if(data.coinToken == "SnowflakeSNW") {
          const result = await wallet.sendTransactionAdvanced(
            [[data.address, (data.amount * (10**Config.decimals))]], // Addresses and amount
            undefined,
            WB.FeeType.FixedFee(Math.round(data.feeAmount * (10**Config.decimals))), // Fee
            (data.paymentID == "" ? undefined : data.paymentID) // Payment ID
          );

          logger.debug(socket, `Sending: ${(data.amount * (10**Config.decimals))} SNW (${data.amount}) with ${Math.round(data.feeAmount * (10**Config.decimals))} SNW (${data.feeAmount}) fee`)
          
          if (result.success) {
            socket.emit("sendTransaction", {
              status: "success",
              hash: result.transactionHash
            });
            logger.debug(socket, `Transaction sent! ${result.transactionHash}`);

            /* Send new balance */
            const [unlockedBalance, lockedBalance] = await wallet.getBalance();
            socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
          } else {
            logger.debug(socket, `Transaction send error: ${result.error.toString()}`);

            if(result.error.errorCode == 11) {
              socket.emit("sendTransaction", {
                status: "error",
                message: "Balance is not enough to send this transaction"
              });
              return;
            }

            socket.emit("sendTransaction", {
              status: "error",
              message: result.error.toString()
            });
            return;
          }
        } else {
          /* Token sending */
          const sendToken = allTokensArr.result[data.coinToken];
          if(sendToken == undefined) {
            /* Token not found */
            socket.emit("sendTransaction", {
              status: "error",
              message: "Token does not exist."
            });
            return;
          }

          /* Create transaction using SFP */
          const createTransaction = await Core.sfp_api('/transaction/send', {
            token_hash: data.coinToken,
            sign_key: hashedPrivKey,
            to_address: data.address,
            amount: (data.amount * (10**sendToken.decimals))
          });

          console.log(createTransaction);
          console.log(data);

          /* Check if SFP request has error */
          if("error" in createTransaction.result) {
            socket.emit("sendTransaction", {
              status: "error",
              message: createTransaction.result.error
            });
            return;
          }

          /* Create network transaction */
          const result = await wallet.sendTransactionAdvanced(
            [[data.address, 1]], // Addresses and amount
            undefined,
            WB.FeeType.FixedFee(createTransaction.result.snw_fee), // Fee
            createTransaction.result.transaction_hash // Payment ID
          );

          logger_sfp.debug(io, `Sending: ${parseFloat(data.amount).toFixed(sendToken.decimals)} ${sendToken.ticker} (${data.amount * (10**sendToken.decimals)}) with ${parseFloat(createTransaction.result.snw_fee / (10**sendToken.decimals)).toFixed(sendToken.decimals)} ${sendToken.ticker} (${createTransaction.result.snw_fee}) fee`)
          
          if (result.success) {
            socket.emit("sendTransaction", {
              status: "success",
              hash: createTransaction.result.transaction_hash
            });
            logger_sfp.debug(io, `Transaction sent! ${createTransaction.result.transaction_hash}`);

            /* Send new balance */
            const [unlockedBalance, lockedBalance] = await wallet.getBalance();
            socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
          } else {
            logger.debug(socket, `Transaction send error: ${result.error.toString()}`);

            if(result.error.errorCode == 11) {
              socket.emit("sendTransaction", {
                status: "error",
                message: "Snowflake balance is not enough to send this transaction"
              });
              return;
            }

            socket.emit("sendTransaction", {
              status: "error",
              message: result.error.toString()
            });
            return;
          }
          
        }
      }
    });

    /* Resync wallet */
    socket.on("resyncWallet", async data => {
      if(data.key == secKey) {
        await wallet.reset(0);

        const [unlockedBalance, lockedBalance] = await wallet.getBalance();
        socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })

        let transactions = await wallet.getTransactions();
        socket.emit('getTransactions', transactions);
      }
    });

    /* Reset wallet */
    socket.on("resetWallet", async data => {
      if(data.key == secKey) {
        await wallet.rescan();

        const [unlockedBalance, lockedBalance] = await wallet.getBalance();
        socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })

        let transactions = await wallet.getTransactions();
        socket.emit('getTransactions', transactions);
      }
    });

    /* Rewind wallet */
    socket.on("rewindWallet", async data => {
      if(data.key == secKey) {
        const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
        await wallet.rewind(walletBlockCount - 1000); 
      }
    })

    socket.on("switchNode", async data => {
      if(data.key == secKey) {
        if(data.daemonAddress) {
          if(data.daemonAddress !== `${Config.daemonHostname}:${Config.daemonPort}`) {
            const daemon = new WB.Daemon(data.daemonAddress.split(':')[0], parseInt(data.daemonAddress.split(':')[1]));
            await wallet.swapNode(daemon);

            Config.daemonHostname = data.daemonAddress.split(':')[0];
            Config.daemonPort = parseInt(data.daemonAddress.split(':')[1]);
            
            logger.debug(socket, `Switching daemon to: ${data.daemonAddress}`)
          }
        }

        if(data.sfpAddress) {
          if(data.sfpAddress !== `${Config.sfpHostname}:${Config.sfpPort}`) {
            Config.sfpHostname = data.sfpAddress.split(':')[0];
            Config.sfpPort = parseInt(data.sfpAddress.split(':')[1]);
            
            logger.debug(socket, `Switching SFP Node to: ${data.sfpAddress}`)
          }
        }
        socket.emit("switchNode");
      }
    });



    /* SFP: Activate wallet */
    socket.on("sfpActivateWallet", async data => {
      if(secKey == data.key) {
        try {
          /* Get private keys of wallet */
          const privateViewKey = wallet.getPrivateViewKey();
          const [publicSpendKey, privateSpendKey, err] = await wallet.getSpendKeys(wallet.getAddresses()[0]);

          /* Do request to SFP Node */
          const activation = await Core.sfp_api('/wallet/activate', { private_spend_key: privateSpendKey, private_view_key: privateViewKey });
          logger_sfp.debug(io, `Address activation success: ${activation.result.success}`);

          /* Activate wallet on SFP */
          socket.emit("sfpActivateWallet", {
            activation_success: activation.result.success
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/wallet/activate' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/wallet/activate' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);
        }
      }
    });

    /* SFP: Get all tokens */
    socket.on("sfpGetTokens", async data => {
      if(secKey == data.key) {
        try {
          /* Get tokens from SFP Node */
          const allTokens = await Core.sfp_api('/tokens');
          let allTokensC = 0; for (let tokens in allTokens.result) { allTokensC++; }
          logger_sfp.debug(io, `Got a total of '${allTokensC}' token(s)`);

          /* Make all tokens ready for global use */
          allTokensArr = allTokens;
          
          /* Return tokens to frontend */
          socket.emit("sfpGetTokens", {
            tokens: allTokens.result
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/tokens' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/tokens' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);

          /* Return sfpGetTokens without data */
          socket.emit("sfpGetTokens", {
            tokens: []
          });
        }
      }
    });

    /* SFP: Get all my tokens balances */
    socket.on("sfpGetBalances", async data => {
      if(secKey == data.key) {
        try {
          /* Get tokens from SFP Node */
          const allTokensBalances = await Core.sfp_api('/tokens/balances', { sign_key: hashedPrivKey });
          let allTokensBalancesC = 0; for (let tokens in allTokensBalances.result) { allTokensBalancesC++; }
          
          /* Return tokens to frontend */
          socket.emit("sfpGetBalances", {
            tokens: allTokensBalances.result
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/tokens/balances' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/tokens/balances' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);
        }
      }
    });

    /* SFP: Get token create price */
    socket.on("sfpTokenPrice", async data => {
      if(secKey == data.key) {
        try {
          /* Get token price from SFP Node */
          const tokenPrice = await Core.sfp_api('/token_price', '');

          /* Make token price global */
          tokenPriceGlob = tokenPrice.result.price;
          
          /* Send token price to frontend */
          socket.emit("sfpTokenPrice", {
            price: tokenPrice.result.price
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/token_price' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/token_price' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);
        }
      }
    });

    /* SFP: Get tx fee */
    socket.on("sfpTxFee", async data => {
      if(secKey == data.key) {
        try {
          /* Get TX Fee from SFP Node */
          const tokenPrice = await Core.sfp_api('/transaction_fee', '');

          /* Send TX Fee to frontend */
          socket.emit("sfpTxFee", {
            fee: tokenPrice.result.fee
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/transaction_fee' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/transaction_fee' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);
        }  
      }
    });

    /* SFP: Create token */
    socket.on("sfpCreateToken", async data => {
      const [unlockedBalance, lockedBalance] = await wallet.getBalance();
        
      /* Check if balance is enough */
      if(unlockedBalance >= (tokenPriceGlob * (10**Config.decimals))) { } else {
        socket.emit('sfpCreateToken', {
          status: "error",
          message: "Balance is not enough to create a token."
        });
        logger_sfp.debug(io, "[CreateToken] Balance is not enough to create a token");
        return;
      }

      const createToken = await Core.sfp_api('/token/create', {
        name: data.token_name,
        ticker: data.ticker,
        decimals: data.decimals,
        max_supply: ((10**data.decimals) * data.max_supply),
        mineable: data.mineable,
        token_type: data.token_type,
        sign_key: hashedPrivKey
      });

      if(createToken.status == "ok") {
        const result = await wallet.sendTransactionAdvanced(
          [[createToken.result.payment_address, (createToken.result.payment_amount * (10**Config.decimals))]], // Addresses and amount
          undefined,
          WB.FeeType.FixedFee(0.00005 * (10**Config.decimals)), // Fee
          createToken.result.payment_id_hash
        );
        
        if (result.success) {
          socket.emit('sfpCreateToken', {
            status: "ok",
            message: "Token has been created. It should be active in est. 10 minutes."
          });

          const [unlockedBalance, lockedBalance] = await wallet.getBalance();
          socket.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
        } else {
          socket.emit('sfpCreateToken', {
            status: "error",
            message: result.error.toString()
          });
          logger_sfp.debug(io, "[CreateToken] " + result.error.toString());
        }        
      } else if(createToken.status == "error") {
        socket.emit('sfpCreateToken', {
          status: "error",
          message: createToken.result.error
        })
      }
    });

    /* SFP: Get all your tokens */
    socket.on("sfpGetMyTokens", async data => {
      if(secKey == data.key) {
        try {
          /* Get my tokens from SFP Node */
          const allTokens = await Core.sfp_api('/tokens/owned', { sign_key: hashedPrivKey });
          let allTokensC = 0; for (let tokens in allTokens.result) { allTokensC++; }
          logger_sfp.debug(io, `Got a total of '${allTokensC}' personal token(s)`);

          /* Return tokens to frontend */
          socket.emit("sfpGetMyTokens", {
            tokens: allTokens.result
          });
          
          /* Return connection success */
          socket.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/my_tokens' success request`);
        } catch(e) {
          logger_sfp.error(socket, `Request '/${Config.sfpVersion}/my_tokens' failed to SFP Node`);

          /* Return connection failed */
          socket.emit("sfpConnection", false);

          /* Return sfpGetMyTokens without data */
          socket.emit("sfpGetMyTokens", {
            tokens: []
          });
        }
      }
    });

    /* SFP: Mint tokens */
    socket.on("sfpMintTokens", async data => {
      if(secKey == data.key) {
        /* Get my tokens from SFP Node */
        const mintTokens = await Core.sfp_api('/transaction/mint', {
          token_hash: data.token_hash,
          sign_key: hashedPrivKey,
          amount: parseInt(data.amount)
        });

        if("error" in mintTokens.result) {
          console.log('test')
          socket.emit("sfpMintTokens", {
            success: false
          });
          return;
        }

        socket.emit("sfpMintTokens", {
          success: true
        });
      }
    });
  });

  /* Start socket server */
  io.listen(22103);

  /* Check connection of a hostname and port */
  function checkConnection(host, port, timeout) {
    return new Promise(function(resolve, reject) {
        timeout = timeout || 1000;     // default of 10 seconds
        var timer = setTimeout(function() {
            reject("timeout");
            socket.end();
        }, timeout);
        var socket = net.createConnection(port, host, function() {
            clearTimeout(timer);
            resolve();
            socket.end();
        });
        socket.on('error', function(err) {
            clearTimeout(timer);
            reject(err);
        });
    });
  }

  /* Check connection of daemon or SFP node */
  function checkProtocols() {
    const daemonInfo = wallet.getDaemonConnectionInfo();
    /* Check daemon connection */
    checkConnection(daemonInfo.host, daemonInfo.port).then(function() {
      io.emit('daemonConnection', true);
    }, function(err) {
      io.emit('daemonConnection', false);
    });

    /* Check sfp connection */
    checkConnection(Config.sfpHostname, Config.sfpPort).then(function() {
      io.emit('sfpConnection', true);
    }, function(err) {
      io.emit('sfpConnection', false);
    });
  }
  
  /* Get balances from WalletBackend */
  async function getBalance() {
    const [unlockedBalance, lockedBalance] = await wallet.getBalance();

    /* Emit to frontend */
    io.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
    
    /* Logger */
    logger.debug(io, `Unlocked Balance: ${(unlockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}, Locked Balance: ${(lockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}`);
  }

  /* Open wallet (create if it does not exist) and set events */
  async function openWallet(walletFile) {
    let newWalletStatus = false;
    try {
      if (fs.existsSync('./' + walletFile)) {
        /* Open wallet file without password */
        const [openedWallet, error] = WB.WalletBackend.openWalletFromFile(daemon, './' + walletFile, '');

        /* Error on opening wallet */
        if (error) {
          console.log('Failed to open wallet: ' + error.toString());
          return;
        }

        /* Set open wallet to global wallet variables */
        wallet = openedWallet;
      } else {
        /* Create wallet file without password */
        const newWallet = WB.WalletBackend.createWallet(daemon);
        newWallet.saveWalletToFile('./' + walletFile, '');

        wallet = newWallet;
        
        newWalletStatus = true;
      }
    } catch (err) {
      console.error(err);
      return;
    }

    /* Start wallet */
    await wallet.start();

    /* If new wallet, then rescan wallet */
    if(newWalletStatus) {
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
      await wallet.reset(networkBlockCount - 100);
    }

    /* Incoming and outgoing TX events */
    wallet.on('incomingtx', async (transaction) => {
      getBalance();
      
      let newTransaction = {};
      let newTransfers = [];
      let token_hash = "";
      let token_amount = "";
      let token_to_address = "";

      if(!(transaction.paymentID == "")) {
        let txSFP;
        try {
          txSFP = await Core.sfp_api(`/transaction/${transaction.paymentID}`, '');

          if(txSFP.status == "ok") {
            token_hash = txSFP.result.token_hash;
            token_amount = txSFP.result.amount;
            token_to_address = txSFP.result.to_address;
          }
      
          /* Return connection success */
          io.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/transaction/${transaction.paymentID}' success request`);
        } catch(e) {
          logger_sfp.error(io, `Request '/${Config.sfpVersion}/transaction/${transaction.paymentID}' failed to SFP Node`);

          /* Return connection failed */
          io.emit("sfpConnection", false);
        }
      }

      for(txs in Object.fromEntries(transaction.transfers)) {
        newTransfers.push({
          amount: Object.fromEntries(transaction.transfers)[txs],
          publicKey: txs
        });
      }

      newTransaction = {
        transfers: newTransfers,
        hash: transaction.hash,
        fee: transaction.fee,
        blockHeight: transaction.blockHeight,
        timestamp: transaction.timestamp,
        paymentID: transaction.paymentID,
        unlockTime: transaction.unlockTime,
        isCoinbaseTransaction: transaction.isCoinbaseTransaction,
        token_hash: (token_hash == "" ? "" : token_hash),
        token_amount: (token_amount == "" ? "" : token_amount),
        token_to_address: (token_to_address == "" ? "" : token_to_address),
      };

      io.emit('getNewTransaction', newTransaction);
    });

    wallet.on('outgoingtx', async (transaction) => {
      getBalance();

      let newTransaction = {};
      let newTransfers = [];
      let token_hash = "";
      let token_amount = "";
      let token_to_address = "";

      if(!(transaction.paymentID == "")) {
        let txSFP;
        try {
          txSFP = await Core.sfp_api(`/transaction/${transaction.paymentID}`, '');

          if(txSFP.status == "ok") {
            token_hash = txSFP.result.token_hash;
            token_amount = txSFP.result.amount;
            token_to_address = txSFP.result.to_address;
          }
      
          /* Return connection success */
          io.emit("sfpConnection", true);
          logger_sfp.debug(io, `Request '/${Config.sfpVersion}/transaction/${transaction.paymentID}' success request`);
        } catch(e) {
          logger_sfp.error(io, `Request '/${Config.sfpVersion}/transaction/${transaction.paymentID}' failed to SFP Node`);

          /* Return connection failed */
          io.emit("sfpConnection", false);
        }
      }

      for(txs in Object.fromEntries(transaction.transfers)) {
        newTransfers.push({
          amount: Object.fromEntries(transaction.transfers)[txs],
          publicKey: txs
        });
      }

      newTransaction = {
        transfers: newTransfers,
        hash: transaction.hash,
        fee: transaction.fee,
        blockHeight: transaction.blockHeight,
        timestamp: transaction.timestamp,
        paymentID: transaction.paymentID,
        unlockTime: transaction.unlockTime,
        isCoinbaseTransaction: transaction.isCoinbaseTransaction,
        token_hash: (token_hash == "" ? "" : token_hash),
        token_amount: (token_amount == "" ? "" : token_amount),
        token_to_address: (token_to_address == "" ? "" : token_to_address),
      };

      io.emit('getNewTransaction', newTransaction);
    });

    /* Hash private view key */
    const privateViewKey = await wallet.getPrivateViewKey();
    hashedPrivKey = crypto.createHash('sha256').update(privateViewKey).digest('hex');

    /* Ouput syncing status */
    const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
    logger.debug(io, `Synced: ${walletBlockCount}/${localDaemonBlockCount-1}`);
    setInterval(() => {
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
      if(walletBlockCount < localDaemonBlockCount) {
        if(!(walletBlockCount == localDaemonBlockCount-1)) {
          logger.debug(io, `Synced: ${walletBlockCount}/${localDaemonBlockCount-1}`);
        }
      }
    }, 3000);

    /* Push sync status to frontend */
    setInterval(() => {
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
      io.emit('getSyncStatus', {
        syncingHeightSync: walletBlockCount,
        networkHeightSync: localDaemonBlockCount-1
      });
    }, 500);

    /* Check connection every 30 seconds */
    setInterval(() => {
      checkProtocols();
    }, 5 * 1000);
  }

  /* Open wallet call */
  openWallet(Config.walletFilename);
})();