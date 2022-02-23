const WB = require('turtlecoin-wallet-backend');
const fs = require('fs');

const httpServer = require("http").createServer();
const io = require("socket.io")(httpServer);

const Config = require('./config.js');
const { Logger, setLogSeverity, Severity } = require('./logger');
const logger = new Logger("WalletBackend");
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

    socket.on("exitApp", async data => {
      if(secKey == data.key) {
        await wallet.saveWalletToFile(Config.walletFilename, '');
        logger.debug(`Wallet saved!`);
        process.exit();
      }
    });
  });

  /* Start socket server */
  io.listen(22103);


  



  async function getBalance() {
    const [unlockedBalance, lockedBalance] = await wallet.getBalance();

    /* Emit to frontend */
    io.emit('getBalances', { unlockedBalance: (unlockedBalance / (10 ** Config.decimals)).toFixed(8), lockedBalance: (lockedBalance / (10 ** Config.decimals)).toFixed(8) })
    
    logger.debug(`Unlocked Balance: ${(unlockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}, Locked Balance: ${(lockedBalance / (10 ** Config.decimals)).toFixed(8)} ${Config.ticker}`);
  }

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
      console.error(err)

      return;
    }

    await wallet.start();

    wallet.on('incomingtx', async (transaction) => getBalance());
    wallet.on('outgoingtx', async (transaction) => getBalance());

    setInterval(() => {
      const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
      logger.debug(`SWAG Synced: ${walletBlockCount}/${localDaemonBlockCount}`);
    }, 3000);

    //await wallet.reset(10940);
  }

  /* Open wallet */
  openWallet(Config.walletFilename);
})();