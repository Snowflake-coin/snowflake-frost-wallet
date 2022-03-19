const WB = require('turtlecoin-wallet-backend');
const fs = require('fs');
const fetch = require('node-fetch');

const httpServer = require("http").createServer();
const io = require("socket.io")(httpServer);

const Config = require('./config.js');
const { Logger, setLogSeverity, Severity } = require('./logger');
const logger = new Logger("WalletBackend");
const logger_sfp = new Logger("SFP-Backend");
setLogSeverity(Severity.TRACE);

const IS_DEVELOPMENT = process.env.NODE_ENV === 'dev';

const daemon = new WB.Daemon(Config.daemonHostname, Config.daemonPort);
let wallet;
let secKey = '';

(async() => {
  /* Socket on */
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

    /* Exit the app */
    socket.on("exitApp", async data => {
      if(secKey == data.key) {
        await wallet.saveWalletToFile(Config.walletFilename, '');
        logger.debug(`Wallet saved!`);
        process.exit();
      }
    });

    /* Send transactions to frontend */
    socket.on("getTransactions", async data => {
      if(secKey == data.key) {
        let transactions = await wallet.getTransactions();
        socket.emit('getTransactions', transactions);
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



    /* SFP: Activate wallet */
    socket.on("sfpActivateWallet", async data => {
      if(secKey == data.key) {
        const privateViewKey = wallet.getPrivateViewKey();
        const [publicSpendKey, privateSpendKey, err] = await wallet.getSpendKeys(wallet.getAddresses()[0]);

        const activation = await sfp_api('/wallet/activate', { private_spend_key: privateSpendKey, private_view_key: privateViewKey });
        logger_sfp.debug(`Address activation success: ${activation.result.success}`);

        socket.emit("sfpActivateWallet", {
          activation_success: activation.result.success
        });
      }
    });

    /* SFP: Get all tokens */
    socket.on("sfpGetTokens", async data => {
      if(secKey == data.key) {
        const allTokens = await sfp_api('/tokens');
        logger_sfp.debug(`Got a total of '0' tokens`);

        socket.emit("sfpGetTokens", {
          tokens: allTokens.result
        });
      }
    });
  });

  /* Start socket server */
  io.listen(22103);


  

  /* SFP API */
  async function sfp_api(request, data) {
    if(data) {
      let response = await fetch(`${Config.sfpProtocol}://${Config.sfpHostname}:${Config.sfpPort}/${Config.sfpVersion}${request}`, {
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": JSON.stringify(data)
      });
      return response.json();
    } else {
      let response = await fetch(`${Config.sfpProtocol}://${Config.sfpHostname}:${Config.sfpPort}/${Config.sfpVersion}${request}`);
      return response.json();
    }
  }

  /* Get balances from WalletBackend */
  async function getBalance() {
    const [unlockedBalance, lockedBalance] = await wallet.getBalance();

    /* Emit to frontend */
    io.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
    
    logger.debug(`Unlocked Balance: ${(unlockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}, Locked Balance: ${(lockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}`);
  }

  /* Open wallet (create if it does not exist) and set syncing events */
  async function openWallet(walletFile) {
    try {
      if (fs.existsSync('./' + walletFile)) {
        /* Open wallet file without password */
        const [openedWallet, error] = WB.WalletBackend.openWalletFromFile(daemon, './' + walletFile, '');

        /* Error on opening wallet */
        if (error) {
          console.log('Failed to open wallet: ' + error.toString());
          return;
        }

        wallet = openedWallet;
      } else {
        /* Create wallet file without password */
        const newWallet = WB.WalletBackend.createWallet(daemon);
        newWallet.saveWalletToFile('./' + walletFile, '');

        wallet = newWallet;
      }
    } catch (err) {
      console.error(err);

      return;
    }

    await wallet.start();

    wallet.on('incomingtx', async (transaction) => { getBalance(); io.emit('getNewTransaction', transaction); });
    wallet.on('outgoingtx', async (transaction) => { getBalance(); io.emit('getNewTransaction', transaction); });

    setInterval(() => {
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
      logger.debug(`Synced: ${walletBlockCount}/${localDaemonBlockCount}`);
    }, 3000);

    //await wallet.reset(10940);
  }

  /* Open wallet call */
  openWallet(Config.walletFilename);
})();