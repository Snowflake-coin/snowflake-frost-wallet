const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const exec = require('child_process').execFile;

const IS_DEVELOPMENT = process.env.NODE_ENV === 'dev';

/* Main window */
let mainWindow = null;
const loadMainWindow = () => {
   mainWindow = new BrowserWindow({
    width: 1100,
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
      contextIsolation: false
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
exec('backend-server/backend-server.exe', function(err, data) {  
  console.log(err);
  console.log(data.toString());
});  

/* Start main window */
app.on("ready", loadMainWindow);

/* Minimize Window */
ipcMain.on('minimize', (event) => {
  mainWindow.minimize();
});

/* Minimize Window */
ipcMain.on('exit', (event) => {
  process.exit();
});

try {
	if(IS_DEVELOPMENT) require('electron-reloader')(module);
} catch {}