const { app, BrowserWindow } = require("electron");
const { startMusicServer } = require("./music-server");

let musicServer;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  musicServer = startMusicServer();
  createWindow();
});

app.on("before-quit", () => {
  if (musicServer) {
    musicServer.close();
  }
});