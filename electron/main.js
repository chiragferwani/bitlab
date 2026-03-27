import { app, BrowserWindow, Menu, protocol } from "electron";
import path from "node:path";
import fs from "node:fs";
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

app.whenReady().then(() => {
  protocol.interceptFileProtocol("file", (request, callback) => {
    let url = request.url.replace("file://", "");
    if (url.endsWith("sql-wasm.wasm")) {
      const wasmPath = path.join(__dirname, "..", "dist", "assets", "sql-wasm.wasm");
      if (fs.existsSync(wasmPath)) {
        callback({ path: wasmPath });
        return;
      }
      // fallback
      const fallback = path.join(__dirname, "..", "public", "sql-wasm.wasm");
      callback({ path: fallback });
      return;
    }
    callback({ path: decodeURIComponent(url) });
  });

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});
