const {
  app,
  BrowserWindow,
  shell,
  Tray,
  Menu,
  nativeImage,
  dialog,
  ipcMain,
  powerMonitor,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const ollama = require("./ollama");
const watchers = require("./watchers");
const device = require("./device");

const isDev = process.env.NODE_ENV === "development";

// Auto-update only works where the bundle can be replaced in place. The macOS
// build is ad-hoc signed (no Developer ID), so Squirrel.Mac cannot apply
// updates — attempting it just throws "ZIP file not provided". Restrict
// auto-download to Windows; mac users update by re-downloading from the site.
autoUpdater.autoDownload = process.platform === "win32";
autoUpdater.autoInstallOnAppQuit = process.platform === "win32";

// Safety net: a stray updater rejection should never bubble up as unhandled.
process.on("unhandledRejection", (reason) => {
  console.error(
    "[Dante] Unhandled rejection:",
    reason && reason.message ? reason.message : reason,
  );
});
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
  console.log("[Dante updater] update available:", info?.version);
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
  console.log("[Dante updater] downloaded:", info?.version);
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
  console.error("[Dante updater]", err?.message || err);
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
    trafficLightPosition: { x: 78, y: 22 },
    transparent: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    show: false,
    icon: path.join(__dirname, "../public/brand/Drift.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Show as soon as the first paint lands OR after 2s, whichever is
  // first. Prevents a blank desktop while the server/auth is cold.
  let shown = false;
  const showOnce = () => { if (!shown && mainWindow && !mainWindow.isDestroyed()) { shown = true; mainWindow.show(); } };
  mainWindow.once("ready-to-show", showOnce);
  setTimeout(showOnce, 2000);

  const loadOpts = {
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
  };

  // Resilient load. The app often launches — or wakes from sleep — a beat
  // before the network is ready, and a single failed loadURL used to dead-end
  // on a blank window with a "Connection Error" box and no way back. Now we
  // retry quietly with backoff and only surface a Retry/Quit choice after
  // several failures; a successful load resets the counter.
  let loadAttempts = 0;
  let retryTimer = null;

  function loadApp() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(APP_URL, loadOpts).catch((err) => {
      console.error("[Dante] Load error:", err && err.message ? err.message : err);
      scheduleRetry();
    });
  }

  function scheduleRetry() {
    if (retryTimer || !mainWindow || mainWindow.isDestroyed()) return;
    loadAttempts += 1;
    if (loadAttempts <= 8) {
      const delay = Math.min(loadAttempts * 1000, 8000); // 1s,2s,…,8s
      retryTimer = setTimeout(() => {
        retryTimer = null;
        loadApp();
      }, delay);
    } else {
      dialog
        .showMessageBox(mainWindow, {
          type: "warning",
          title: "Connection Error",
          message: "Could not connect to Dante.",
          detail: `Couldn't reach ${APP_URL}.\n\nCheck your internet connection.`,
          buttons: ["Retry", "Quit"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            loadAttempts = 0;
            loadApp();
          } else {
            app.quit();
          }
        })
        .catch(() => {});
    }
  }

  let lastHttpCode = 0;

  loadApp();

  // A 5xx from the server (e.g. a transient Vercel 504 middleware timeout) does
  // NOT fire did-fail-load — the error page "loads" successfully. Treat it as a
  // retriable failure so the app self-heals instead of stranding the user on a
  // raw error page.
  mainWindow.webContents.on("did-navigate", (_e, _url, httpResponseCode) => {
    lastHttpCode = httpResponseCode || 0;
    if (lastHttpCode >= 500) {
      console.error(`[Dante] Server returned ${lastHttpCode}; retrying`);
      scheduleRetry();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    if (lastHttpCode < 500) loadAttempts = 0; // reset backoff only on a real success
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
    if (code === -3 || !isMainFrame) return; // -3 = ERR_ABORTED (redirects etc.)
    console.error(`[Dante] Load failed: ${code} ${desc}`);
    scheduleRetry();
  });

  // Reconnect when the Mac wakes from sleep (network returns after resume).
  powerMonitor.on("resume", () => {
    loadAttempts = 0;
    loadApp();
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

  // Cmd+Shift+I toggles DevTools in all builds (production included)
  mainWindow.webContents.on("before-input-event", (_e, input) => {
    if (
      input.type === "keyDown" &&
      input.key === "I" &&
      input.shift &&
      (input.meta || input.control)
    ) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

function createTray() {
  const isMac = process.platform === "darwin";
  // mac: monochrome menu-bar template image. win/linux: full-colour brand icon —
  // setTemplateImage there renders the icon as a black blob, so guard it to mac.
  const iconPath = path.join(
    __dirname,
    isMac ? "../public/brand/logo-circle.png" : "../public/brand/Drift.png",
  );
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;
  icon = icon.resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 });
  if (isMac) icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Dante");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Dante",
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
      console.error("[Dante] PDF parse failed:", filePath, err?.message);
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

// Streaming-friendly PDF text extractor.
//
// pdf-parse (the original) materializes the entire parsed document
// in memory before returning the text. For a 100MB drawing PDF
// that's ~500MB peak. With the renderer's 4-wide queue + main's
// 2-wide semaphore, we'd still hit ~1GB peak and OOM the main
// process on typical fiduciary deal-room data.
//
// pdfjs-dist exposes per-page extraction. Memory profile per call:
//   • Full file buffer held by pdfjs internals (file size)
//   • Small per-page overhead (5-10MB) released by page.cleanup()
//   • Accumulated text capped at MAX_CHARS (~1MB)
// Total peak ≈ file_size + 12MB. A 100MB PDF stays under 120MB
// per call; with semaphore=2 concurrent, peak main is ~250MB.
//
// pdfjs-dist 5.x is ESM-only — main.js is CommonJS, so we go
// through dynamic import (works at runtime). The legacy build
// runs without the worker, important since pdfjs's worker
// machinery doesn't easily survive bundling into electron-builder.
let _pdfjs;
async function getPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (_pdfjs.GlobalWorkerOptions) {
      // pdfjs-dist 5.x always tries to set up a worker, even when
      // we pass disableWorker:true to getDocument(). It needs
      // workerSrc to point at the actual worker file. require.resolve
      // works in dev (real filesystem) and inside the packaged
      // Electron app — provided pdfjs-dist is asarUnpack'd, which
      // we configure in package.json's build.asarUnpack list.
      try {
        const workerPath = require.resolve(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
        );
        _pdfjs.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
      } catch (err) {
        console.error("[pdfjs] worker resolve failed:", err?.message);
      }
    }
  }
  return _pdfjs;
}

async function extractPdfStreaming(filePath, maxChars) {
  const pdfjs = await getPdfjs();
  // Buffer-based load: read the file once, hand it to pdfjs as a
  // Uint8Array. Peak memory per call ~ file_size + small per-page
  // overhead released by page.cleanup() between iterations. For
  // a 100MB PDF that's ~110MB; a 500MB drawing PDF is ~520MB. The
  // 2-wide main semaphore caps concurrent extracts so peak heap
  // during a deal-room scan stays under ~1.1GB even with two
  // concurrent 500MB files.
  //
  // True streaming via PDFDataRangeTransport is the right answer
  // for >1GB single files but the listener-wiring API is finicky
  // and not well-documented; deferred to v1.3 work. Files >1GB
  // get rejected_size today.
  const buf = fs.readFileSync(filePath);
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  let text = "";
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        const pageText = (content.items || [])
          .map((it) => ("str" in it && typeof it.str === "string" ? it.str : ""))
          .filter(Boolean)
          .join(" ");
        text += pageText + "\n\n";
      } finally {
        // Frees the page's intermediate operator list + render
        // state. Without this, peak memory grows linearly with
        // pages traversed instead of staying flat.
        try {
          page.cleanup();
        } catch {
          /* ignore */
        }
      }
      if (text.length > maxChars) {
        text = text.slice(0, maxChars);
        break;
      }
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
  return text;
}

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
    title: "Pick a folder for Dante to watch",
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

// Force a full recursive rescan of a watched folder. Walks the
// tree with Node fs, fires fileEvent for every file. Bypasses
// chokidar's initial-scan entirely so it works even when FSEvents
// is in a degraded state after repeated subscribe/unsubscribe
// cycles. Server-side sha256 dedup makes this idempotent.
ipcMain.handle("watched:rescan", async (_e, folder) => {
  if (!folder || !folder.folder_path) {
    return { ok: false, reason: "no_folder" };
  }
  return watchers.rescanFolder(folder, (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("watched:fileEvent", event);
    }
  });
});

// Extract text from a file by path. Used by the watched-folders
// confirm + auto-update flow: when the user approves a pending
// file (or the watcher detects a change to an already-confirmed
// file), we read the file in the main process, extract text via
// pdf-parse / docx / plain-text, and hand the text back to the
// renderer to ship to the server.
//
// Memory: pdf-parse holds the full PDF buffer plus intermediate
// page structures during parse — peak memory per call is ~5x the
// PDF's on-disk size. The renderer used to invoke this IPC up to
// 4-wide concurrently for rescans, which meant 4 huge PDFs
// parsing in parallel could push main process memory past 1.5GB
// and the OS would kill it. The window goes black because the
// BrowserWindow's main partner is dead.
//
// The semaphore caps in-flight extracts at 2 regardless of how
// many requests the renderer queues. New requests wait until a
// slot frees up. Slow-but-stable beats fast-and-crashing.
const EXTRACT_CONCURRENCY = 2;
let extractActive = 0;
const extractWaitQueue = [];
function acquireExtractSlot() {
  return new Promise((resolve) => {
    if (extractActive < EXTRACT_CONCURRENCY) {
      extractActive++;
      resolve();
    } else {
      extractWaitQueue.push(resolve);
    }
  });
}
function releaseExtractSlot() {
  extractActive--;
  const next = extractWaitQueue.shift();
  if (next) {
    extractActive++;
    next();
  }
}

ipcMain.handle("watched:extractFileText", async (_e, payload) => {
  const filePath = payload?.path;
  const ext = (payload?.ext || "").toLowerCase();
  if (!filePath) return { error: "no path" };
  const MAX_CHARS = 800_000;
  // Hard ceiling on extraction. With buffer-based pdfjs and the
  // 2-wide main semaphore, two concurrent 500MB files = ~1.1GB
  // peak main heap, comfortable on a 16GB Mac. A single 1GB PDF
  // = 1GB buffer × 2 concurrent = 2GB peak — borderline. Cap
  // at 1GB so we don't allocate 2GB+ buffers on machines with
  // less RAM. Files >1GB get rejected_size; almost always those
  // are scanned binders or video PDFs that wouldn't OCR usefully
  // anyway. v1.3 will add IPDFStream for genuine 1GB+ ingestion.
  const MAX_EXTRACT_BYTES = 1024 * 1024 * 1024;
  try {
    const preStat = fs.statSync(filePath);
    if (preStat.size > MAX_EXTRACT_BYTES) {
      return {
        error: "file_too_large_to_extract",
        size: preStat.size,
        max: MAX_EXTRACT_BYTES,
      };
    }
  } catch (err) {
    return { error: err?.message || "stat_failed" };
  }
  await acquireExtractSlot();
  try {
    if (!fs.existsSync(filePath)) return { error: "file not found" };
    let text = "";
    if (ext === "pdf") {
      text = await extractPdfStreaming(filePath, MAX_CHARS);
    } else if (ext === "docx") {
      text = await extractDocxText(filePath);
    } else {
      text = fs.readFileSync(filePath, "utf8");
    }
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }
    return { text, truncated, char_count: text.length };
  } catch (err) {
    return { error: err?.message || String(err) };
  } finally {
    releaseExtractSlot();
  }
});

ipcMain.handle("ollama:probe", async () => ollama.probe());
ipcMain.handle("ollama:complete", async (_e, opts) => ollama.complete(opts || {}));
ipcMain.handle("ollama:embed", async (_e, opts) => ollama.embed(opts || {}));
ipcMain.handle("ollama:ensureRunning", async () => ollama.ensureRunning());

ipcMain.handle("device:get", async () => device.load(app.getPath("userData")));

// SourceViewer support: read a vault file's bytes from the user's
// machine. Only fires for watched-folder ingests where file_url is
// null and the API responded with { kind: 'local', path }. The
// renderer pipes the returned ArrayBuffer into react-pdf via
// the Document.file prop.
//
// 500MB hard ceiling here keeps an accidental 4GB binary from
// blowing main's heap; the SourceViewer surfaces a friendly error.
ipcMain.handle("vault:readLocalFile", async (_e, filePath) => {
  if (!filePath || typeof filePath !== "string") {
    return { error: "no_path" };
  }
  try {
    const stat = fs.statSync(filePath);
    const MAX_VIEWABLE_BYTES = 500 * 1024 * 1024;
    if (stat.size > MAX_VIEWABLE_BYTES) {
      return {
        error: "file_too_large_to_view",
        size: stat.size,
        max: MAX_VIEWABLE_BYTES,
      };
    }
    const buf = fs.readFileSync(filePath);
    // Return the underlying ArrayBuffer slice — IPC's structured
    // clone passes ArrayBuffers across cleanly.
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
    return { bytes: ab, size: buf.byteLength };
  } catch (err) {
    return { error: err?.message || "read_failed" };
  }
});

// Open a specific macOS System Settings pane. The folder picker
// from NSOpenPanel grants implicit access to whatever the user
// selects, but a few "protected" locations on modern macOS
// (Documents, Desktop, Downloads, iCloud Drive, external volumes)
// require an explicit allow toggle the user has to flip themselves
// in Privacy & Security. We can't grant it programmatically — we
// can only open the right pane and explain.
//
// `pane` is a known string we map to the deep-link URL. Anything
// unrecognized opens the top-level Privacy & Security pane.
ipcMain.handle("system:openSettingsPane", async (_e, pane) => {
  const map = {
    files_and_folders:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
    full_disk_access:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    privacy:
      "x-apple.systempreferences:com.apple.preference.security?Privacy",
  };
  const url = map[pane] || map.privacy;
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

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
    console.warn("[Dante] ollama.ensureRunning failed:", err?.message || err),
  );

  createWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // Only auto-check for updates where auto-update can actually apply (Windows).
  if (!isDev && process.platform === "win32") {
    autoUpdater.checkForUpdates().catch((e) =>
      console.error("[Dante updater] initial check failed:", e?.message || e)
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
