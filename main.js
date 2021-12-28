const { app, BrowserWindow } = require("electron");
const path = require("path");

const loadMainWindow = () => {
    const mainWindow = new BrowserWindow({
        width : 1600,
        height: 600,
        icon: "logo.png",
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
      loadMainWindow();
  }
});


/* Hot reload */
try {
  require('electron-reloader')(module)
} catch (_) {}