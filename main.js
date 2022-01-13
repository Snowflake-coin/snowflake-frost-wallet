const { Worker, isMainThread, parentPort } = require('worker_threads');
const { app, BrowserWindow, ipcMain, webContents } = require("electron");
const path = require("path");

const WorkerMessages = require('./src/workerMessages.js');
const Config = require('./src/config.js');
const { Logger, setLogSeverity, Severity } = require('./src/logger');
const workerMessages = require('./src/workerMessages.js');

setLogSeverity(Severity.TRACE);
const logger = new Logger("Main");

let mainWindow = null

const loadMainWindow = () => {
   mainWindow = new BrowserWindow({
    width: 1100,
    height: 600,
    minWidth: 1100,
    minHeight: 600,
    frame: false,
    transparent: true,
    icon: __dirname + '/icon.ico',
    enableRemoteModule: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Remove when in production
  mainWindow.openDevTools();

  mainWindow.loadFile(path.join(__dirname, "/public/index.html"));
}

app.on("ready", loadMainWindow);

app.on("window-all-closed", () => {
  walletBackendWorker.postMessage({
    type: WorkerMessages.SAVE_WALLET,
    data: {
      walletFile: Config.walletFilename
    }
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    loadMainWindow();
  }
});




const walletBackendWorker = new Worker('./src/workers/wallet-backend.js');
walletBackendWorker.on('message', ({ type, data }) => {
  logger.debug('message :>> ', { type, data });

  switch (type) {
    /* Wallet has been opened */
    case WorkerMessages.OPENED_WALLET:
      mainWindow.webContents.send('walletOpened');
      break;

    /* Get primary address */
    case WorkerMessages.GET_PRIMARY_ADDRESS:
      mainWindow.webContents.send('getPrimaryAddress', { address: data.address } );
      break;

    /* Get balances */
    case WorkerMessages.GET_BALANCE:
      mainWindow.webContents.send('getBalances', { unlockedBalance: (data.unlockedBalance / (10 ** Config.decimals)).toFixed(Config.decimals), lockedBalance: (data.lockedBalance / (10 ** Config.decimals)).toFixed(Config.decimals) } );
      break;

    /* Close App */
    case workerMessages.CLOSE_APP:    
      if (process.platform !== "darwin") { app.quit(); }
      break;
  }
});




/* Minimize Window */
ipcMain.on('minimize', (event) => {
  mainWindow.minimize();
});

/* Load wallet */
ipcMain.on('loadWallet', (event) => {
  walletBackendWorker.postMessage({
    type: WorkerMessages.OPEN_WALLET,
    data: {
      walletFile: Config.walletFilename
    }
  });
});

/* Get primary address */
ipcMain.on('getPrimaryAddress', (event) => {
  walletBackendWorker.postMessage({
    type: WorkerMessages.GET_PRIMARY_ADDRESS,
    data: {}
  });
});







/* Update balance */
ipcMain.on('updateBalance', (event) => {
  (async () => {
    /* Get balance and address */
    const [unlockedBalance, lockedBalance] = await wallet.getBalance();
    const address = await wallet.getPrimaryAddress();

    /* Update balance on frontend */
    event.reply('updateBalance', {
      address: address,
      unlockedBalance: unlockedBalance / (10 ** 8),
      lockedBalance: lockedBalance / (10 ** 8)
    });
  })();
});

/* Update sync status */
ipcMain.on('getSyncStatus', (event) => {
  (async () => {
    const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();

    /* Update balance on frontend */
    event.reply('getSyncStatus', {
      walletBlockCount: walletBlockCount,
      localDaemonBlockCount: localDaemonBlockCount,
      networkBlockCount: networkBlockCount
    });
  })();
});


try {
	require('electron-reloader')(module);
} catch {}