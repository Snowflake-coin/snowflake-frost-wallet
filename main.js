const { app, BrowserWindow, ipcMain } = require("electron");
const WB = require('turtlecoin-wallet-backend');
const path = require("path");
const fs = require('fs')

const daemon = new WB.Daemon('snowflake-net.com', 22101);
let wallet;

const loadMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1700, // 1200
    height: 600,
    icon: __dirname + '/icon.ico',
    enableRemoteModule: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Remove when in production
  mainWindow.webContents.openDevTools();

  mainWindow.loadFile(path.join(__dirname, "/public/index.html"));
}

app.on("ready", loadMainWindow);

app.on("window-all-closed", () => {
  (async () => {
    wallet.saveWalletToFile('wallet.dat', '');
  
    if (process.platform !== "darwin") {
      app.quit();
    }
  })();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    loadMainWindow();
  }
});



ipcMain.on('loadWallet', (event) => {
  (async () => {
    console.log(fs.existsSync('./wallet.dat'))
    try {
      if (fs.existsSync('./wallet.dat')) {
        /* Open wallet file without password */
        const [openedWallet, error] = await WB.WalletBackend.openWalletFromFile(daemon, 'wallet.dat', '');

        // Error on opening wallet
        if (error) {
          console.log('Failed to open wallet: ' + error.toString());
          return;
        }

        wallet = openedWallet;
      } else {
        /* Create wallet file without password */
        const newWallet = await WB.WalletBackend.createWallet(daemon);
        wallet.saveWalletToFile('wallet.dat', '');

        wallet = newWallet;
      }
    } catch(err) {
      console.error(err)
    }
    
    /* Start wallet */
    await wallet.start();

    //await wallet.reset(10959);
  })().catch(err => {
    console.log('Caught promise rejection: ' + err);
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
      unlockedBalance: unlockedBalance / (10**8),
      lockedBalance: lockedBalance / (10**8)
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


/*
try {
  require('electron-reloader')(module);
} catch {}
*/