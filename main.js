const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const exec = require('child_process').execFile;

const IS_DEVELOPMENT = process.env.NODE_ENV === 'dev';

/* Main window */
let mainWindow = null;
const loadMainWindow = () => {
   mainWindow = new BrowserWindow({
    width: 1250,
    height: 600,
    minWidth: 1100,
    minHeight: 600,
    resizable: false,
    frame: false,
    transparent: true,
    icon: __dirname + '/icon.ico',
    enableRemoteModule: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  if(IS_DEVELOPMENT) mainWindow.openDevTools();

  mainWindow.loadFile(path.join(__dirname, "/public/index.html"));
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    loadMainWindow();
  }
});

/* Run backend server executable */
if(!IS_DEVELOPMENT) {
  exec(`${(process.platform === "win32" ? '' : './')}backend-server/backend-server${(process.platform === "win32" ? '.exe' : '')}`, function(err, data) {  
    console.log(err);
    console.log(data.toString());
  });
}

/* Start main window */
app.on("ready", loadMainWindow);

/* Minimize Window */
ipcMain.on('minimize', (event) => {
  mainWindow.minimize();
});

/* Exit Window */
ipcMain.on('exit', (event) => {
  process.exit();
});



try {
	if(IS_DEVELOPMENT) require('electron-reloader')(module, {
    ignore: [
      'settings.json',
      'wallet.json',
      'wallet.dat'
    ]
  });
} catch {}