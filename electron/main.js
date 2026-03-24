import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !!process.env.ELECTRON_DEV_URL;

function getWindowIconPath() {
  if (process.platform === "win32") {
    return path.join(__dirname, "..", "assets", "icons", "icon.ico");
  }
  if (process.platform === "darwin") {
    return path.join(__dirname, "..", "assets", "icons", "icon.icns");
  }
  return path.join(__dirname, "..", "assets", "icons", "icon.png");
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "BitLab",
    icon: getWindowIconPath(),
    frame: true,
    titleBarStyle: "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
