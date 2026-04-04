import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !!process.env.ELECTRON_DEV_URL;

let win;

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
  console.log("[BitLab] Creating window...");

  win = new BrowserWindow({
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
      webSecurity: false,
    },
  });

  Menu.setApplicationMenu(null);

  // Debug listeners
  win.webContents.on("did-start-loading", () =>
    console.log("[BitLab] Started loading")
  );
  win.webContents.on("did-finish-load", () => {
    console.log("[BitLab] Finished loading");
    clearTimeout(watchdog);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) =>
    console.log("[BitLab] FAILED to load:", code, desc)
  );
  win.webContents.on("crashed", () =>
    console.log("[BitLab] Renderer crashed")
  );
  win.webContents.on("unresponsive", () =>
    console.log("[BitLab] Renderer unresponsive")
  );

  if (isDev) {
    win.loadURL(process.env.ELECTRON_DEV_URL);
    win.webContents.openDevTools();
  } else {
    console.log("[BitLab] Loading index.html from dist...");
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Watchdog — if nothing loads in 15 seconds, show error with retry
  const watchdog = setTimeout(() => {
    if (win && !win.isDestroyed()) {
      console.log("[BitLab] Watchdog triggered — load timed out");
      win.webContents
        .executeJavaScript(
          `document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;color:#f85149;font-family:monospace;font-size:13px;flex-direction:column;gap:12px"><span>BitLab failed to load</span><button onclick="location.reload()" style="padding:6px 16px;background:transparent;border:1px solid #30363d;color:#e6edf3;border-radius:6px;cursor:pointer;font-family:monospace">Retry</button></div>'`
        )
        .catch(() => {});
    }
  }, 15000);

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  console.log("[BitLab] App ready");
  if (process.platform === "linux") {
    app.setName("BitLab");
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
