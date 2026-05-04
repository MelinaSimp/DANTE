const {
  app,
  BrowserWindow,
  shell,
  Tray,
  Menu,
  nativeImage,
  dialog,
  ipcMain,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const ollama = require("./ollama");
const watchers = require("./watchers");
const device = require("./device");

const isDev = process.env.NODE_ENV === "development";

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://driftai.studio/api/desktop-download",
});

// Update state, broadcast to the renderer so the in-app UpdateBanner
// can show "Update now" without us having to render a native dialog.
// The renderer subscribes via window.electronAPI.updates.onState.
let updateState = {
  status: "idle", // idle | checking | available | downloading | downloaded | not_available | error
  version: null,
  downloaded_version: null,
  progress_percent: null,
  error: null,
};

function emitUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:state", updateState);
  }
}

autoUpdater.on("checking-for-update", () => {
  updateState = { ...updateState, status: "checking", error: null };
  emitUpdateState();
});
autoUpdater.on("update-available", (info) => {
  console.log("[Drift updater] update available:", info?.version);
  updateState = {
    ...updateState,
    status: "downloading",
    version: info?.version || null,
    error: null,
  };
  emitUpdateState();
});
autoUpdater.on("update-not-available", () => {
  updateState = { ...updateState, status: "not_available", error: null };
  emitUpdateState();
});
autoUpdater.on("download-progress", (p) => {
  updateState = {
    ...updateState,
    status: "downloading",
    progress_percent:
      typeof p?.percent === "number" ? Math.round(p.percent) : null,
  };
  emitUpdateState();
});
autoUpdater.on("update-downloaded", (info) => {
  console.log("[Drift updater] downloaded:", info?.version);
  updateState = {
    ...updateState,
    status: "downloaded",
    downloaded_version: info?.version || updateState.version || null,
    progress_percent: 100,
    error: null,
  };
  emitUpdateState();
});
autoUpdater.on("error", (err) => {
  console.error("[Drift updater]", err?.message || err);
  updateState = {
    ...updateState,
    status: "error",
    error: err?.message || String(err),
  };
  emitUpdateState();
});
// Desktop app boots into /dashboard: middleware bounces unauthed users
// to /auth for sign-in; signed-in users land straight in the app. The
// public /download page never shows inside an installed desktop app.
const APP_URL = isDev
  ? "http://localhost:3000/dashboard"
  : "https://driftai.studio/dashboard";

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

// Phase 9 — agentic PDF intake. Renderer asks for a file picker via
// preload's pickAndExtractPdfs(); we open the OS dialog, read each
// PDF locally with pdf-parse, and return just { name, text } so the
// PDF bytes never leave the user's machine. The renderer ships those
// strings to /api/properties/intake which calls OpenAI for the
// structured property record.
ipcMain.handle("pdfs:pickAndExtract", async () => {
  const result = await dialog.showOpenDialog({
    title: "Pick PDFs to import",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "PDFs", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  // pdf-parse runs in the Node main process — works fine here even
  // though it errors out on Vercel's serverless runtime.
  const pdfParse = require("pdf-parse");

  const out = [];
  for (const filePath of result.filePaths) {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      out.push({
        name: path.basename(filePath),
        text: (parsed.text || "").slice(0, 60000),
        size: buffer.length,
      });
    } catch (err) {
      console.error("[Drift] PDF parse failed:", filePath, err?.message);
      out.push({
        name: path.basename(filePath),
        text: "",
        size: 0,
        error: err?.message || "parse failed",
      });
    }
  }
  return out;
});

// Hermes direct-chat — pick files from the user's filesystem and
// extract their text in the main process so the renderer can stuff
// the content into a local-only chat context. No bytes leave the
// machine: the picked file is read by Node fs, parsed, and only
// the extracted text crosses the IPC boundary back to the renderer,
// which feeds it to localhost Ollama via window.driftLocal.complete().
//
// Supported formats:
//   .pdf  — pdf-parse (already a dep)
//   .docx — fast-parse via JSZip + a tiny xml strip (no extra dep)
//   .txt .md .csv .log .json .yaml .yml — read as utf-8
//
// Per-file cap: 200_000 chars after extraction so a single huge PDF
// can't blow up the context window. Files larger than that are
// truncated with a marker; the renderer surfaces that to the user.
ipcMain.handle("hermes:pickAndReadFiles", async () => {
  const result = await dialog.showOpenDialog({
    title: "Pick files for Hermes to read",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Text & docs",
        extensions: [
          "pdf",
          "docx",
          "txt",
          "md",
          "csv",
          "log",
          "json",
          "yaml",
          "yml",
          "rtf",
        ],
      },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const MAX_CHARS = 200_000;
  const out = [];
  for (const filePath of result.filePaths) {
    const ext = (path.extname(filePath).slice(1) || "").toLowerCase();
    const name = path.basename(filePath);
    let size = 0;
    let text = "";
    let error = null;
    try {
      const stat = fs.statSync(filePath);
      size = stat.size;
      if (ext === "pdf") {
        const pdfParse = require("pdf-parse");
        const buf = fs.readFileSync(filePath);
        const parsed = await pdfParse(buf);
        text = parsed.text || "";
      } else if (ext === "docx") {
        text = await extractDocxText(filePath);
      } else {
        text = fs.readFileSync(filePath, "utf8");
      }
    } catch (err) {
      error = err?.message || "read failed";
    }
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }
    out.push({ name, path: filePath, size, ext, text, error, truncated });
  }
  return out;
});

// Best-effort .docx text extraction. A docx is a zip with a
// word/document.xml; we strip XML tags and decode basic entities.
// Good enough for compliance memos and ADV drafts; not great for
// tables or footnotes. If we ever care, swap for `mammoth`.
async function extractDocxText(filePath) {
  const JSZip = require("jszip");
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return "";
  return docXml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Hermes Phase 2: Watched folders + local LLM ─────────────────
//
// IPC contract:
//   watched:pickFolder — open OS folder picker, return path
//   watched:sync(folders) — replace active watcher set
//   watched:fileEvent — sent FROM main TO renderer when a file is
//     detected; renderer is responsible for calling /api/electron/
//     watched-folders/[id]/notify with its session cookies
//   ollama:probe — capability check
//   ollama:complete(opts) — local chat completion (privacy mode)
//   ollama:embed(opts) — local embedding (privacy mode)
//   ollama:ensureRunning — try to spawn Ollama if installed but down
//   device:get — return persistent device_id + label

ipcMain.handle("watched:pickFolder", async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Pick a folder for Drift to watch",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, folder_path: result.filePaths[0] };
});

ipcMain.handle("watched:sync", async (_e, folders) => {
  watchers.syncWatchers(Array.isArray(folders) ? folders : [], (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("watched:fileEvent", event);
    }
  });
  return { ok: true, active: Array.isArray(folders) ? folders.length : 0 };
});

ipcMain.handle("ollama:probe", async () => ollama.probe());
ipcMain.handle("ollama:complete", async (_e, opts) => ollama.complete(opts || {}));
ipcMain.handle("ollama:embed", async (_e, opts) => ollama.embed(opts || {}));
ipcMain.handle("ollama:ensureRunning", async () => ollama.ensureRunning());

ipcMain.handle("device:get", async () => device.load(app.getPath("userData")));

// Update flow — renderer-driven. The dashboard's UpdateBanner
// subscribes to updates:state, calls updates:check on login, and
// updates:apply when the user clicks "Update now."
ipcMain.handle("updates:getState", async () => updateState);
ipcMain.handle("updates:check", async () => {
  if (isDev) {
    return { ok: false, reason: "skipped_in_dev" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      version: result?.updateInfo?.version || null,
    };
  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
  }
});
ipcMain.handle("updates:apply", async () => {
  if (updateState.status !== "downloaded") {
    return { ok: false, reason: "no_update_downloaded" };
  }
  // quitAndInstall doesn't return — the app shuts down and relaunches.
  setTimeout(() => autoUpdater.quitAndInstall(), 200);
  return { ok: true };
});

app.whenReady().then(async () => {
  // Pre-warm device identity (creates device.json on first run).
  device.load(app.getPath("userData"));

  // Best-effort: if Ollama is installed but not running, start it
  // silently. Doesn't block window creation — the privacy-mode
  // panel will reflect the real state by the time the user opens it.
  ollama.ensureRunning().catch((err) =>
    console.warn("[Drift] ollama.ensureRunning failed:", err?.message || err),
  );

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

app.on("before-quit", () => {
  watchers.stopAll();
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
