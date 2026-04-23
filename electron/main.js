const { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

const isDev = process.env.NODE_ENV === "development";

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://driftai.studio/api/desktop-download",
});
autoUpdater.on("error", (err) => console.error("[Drift updater]", err?.message || err));
autoUpdater.on("update-available", (info) =>
  console.log("[Drift updater] update available:", info?.version)
);
autoUpdater.on("update-downloaded", (info) => {
  console.log("[Drift updater] downloaded:", info?.version);
  dialog
    .showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Drift ${info?.version || ""} has been downloaded.`,
      detail: "Restart the app to apply the update.",
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
});
const APP_URL = isDev ? "http://localhost:3000" : "https://driftai.studio";

const ALLOWED_HOSTS = ["driftai.studio", "localhost", "127.0.0.1", "vercel.app"];

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#000000",
    show: false,
    icon: path.join(__dirname, "../public/brand/logo-circle.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  const loadOpts = {
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
  };

  mainWindow.loadURL(APP_URL, loadOpts).catch((err) => {
    console.error("[Drift] Load error:", err.message);
    dialog.showErrorBox(
      "Connection Error",
      `Could not connect to ${APP_URL}.\n\nCheck your internet connection and try again.`
    );
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    if (code === -3) return;
    console.error(`[Drift] Load failed: ${code} ${desc}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev || process.env.DEBUG === "true") {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/brand/logo-circle.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  icon = icon.resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Drift AI");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Drift",
        click: () => {
          if (mainWindow) mainWindow.show();
          else createWindow();
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ])
  );
  tray.on("click", () => {
    if (mainWindow) mainWindow.show();
    else createWindow();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  if (!isDev) {
    autoUpdater.checkForUpdates().catch((e) =>
      console.error("[Drift updater] initial check failed:", e?.message || e)
    );
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    try {
      const host = new URL(url).hostname;
      if (!ALLOWED_HOSTS.some((d) => host === d || host.endsWith("." + d))) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
});
