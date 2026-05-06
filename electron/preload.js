const { contextBridge, ipcRenderer } = require("electron");

// Drift's renderer-side surface. Anything reachable on window.electronAPI
// or window.driftLocal is sandbox-safe — preload runs with
// contextIsolation=true, so the renderer never gets a Node handle directly.

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Phase 9 — agentic PDF intake. Opens an OS file picker, reads the
  // PDFs the user selects, runs pdf-parse on each in the Electron
  // main process, and returns just the extracted text. The PDFs never
  // leave the user's machine; only text + filename get sent to the
  // backend OpenAI extractor.
  pickAndExtractPdfs: () => ipcRenderer.invoke("pdfs:pickAndExtract"),

  // Hermes Phase 2 — watched folders.
  watched: {
    /** Open an OS folder picker. Returns { canceled, folder_path }. */
    pickFolder: () => ipcRenderer.invoke("watched:pickFolder"),

    /** Replace the active watcher set with this list of folders.
     *  Pass the JSON the GET /api/electron/watched-folders route
     *  returned. Idempotent — call after every fetch. */
    sync: (folders) => ipcRenderer.invoke("watched:sync", folders),

    /** Force a full recursive rescan of a folder. Walks the tree
     *  with Node fs and fires fileEvent for every file, bypassing
     *  chokidar entirely. Use when chokidar's initial-scan missed
     *  files (FSEvents degradation after rapid sub/unsub cycles).
     *  Server-side sha256 dedup keeps this idempotent. */
    rescan: (folder) => ipcRenderer.invoke("watched:rescan", folder),

    /** Subscribe to file-detected events. The handler receives
     *  { folder_id, file_path, file_name, file_extension,
     *    file_size_bytes, content_sha256, kind_of_event }.
     *  Returns an unsubscribe function. */
    onFileEvent: (handler) => {
      const wrapped = (_event, data) => handler(data);
      ipcRenderer.on("watched:fileEvent", wrapped);
      return () => ipcRenderer.off("watched:fileEvent", wrapped);
    },

    /** Extract text from a specific file by path. Used by the
     *  confirm + auto-update flow to ship extracted text to the
     *  server for chunking. Returns { text, truncated, char_count }
     *  on success or { error } on failure. NEVER call this for
     *  files in local_only folders — the whole point is the bytes
     *  stay on the user's machine. */
    extractFileText: (path, ext) =>
      ipcRenderer.invoke("watched:extractFileText", { path, ext }),
  },

  /** Open a specific macOS System Settings pane to help the user
   *  grant Drift the folder access it needs. macOS doesn't let
   *  apps request access programmatically — we can only open the
   *  right pane and explain. */
  openSystemSettings: (pane) =>
    ipcRenderer.invoke("system:openSettingsPane", pane),

  /** Get this installation's persistent device identity.
   *  Returns { device_id, device_label, created_at }. */
  getDevice: () => ipcRenderer.invoke("device:get"),

  /** Auto-updater bridge. The dashboard's UpdateBanner uses this
   *  to render the "update available / update now" UX in-app
   *  instead of a native dialog box. */
  updates: {
    /** Snapshot of the current update state. Useful on mount
     *  to render the banner immediately if an update was already
     *  downloaded before the renderer attached. */
    getState: () => ipcRenderer.invoke("updates:getState"),
    /** Force a check now. The dashboard calls this on login so
     *  users see the banner without waiting for the 4h interval. */
    check: () => ipcRenderer.invoke("updates:check"),
    /** Quit + relaunch into the new version. Only valid after the
     *  state has reached 'downloaded'. */
    apply: () => ipcRenderer.invoke("updates:apply"),
    /** Subscribe to state-change broadcasts. Returns an
     *  unsubscribe function. */
    onState: (handler) => {
      const wrapped = (_event, data) => handler(data);
      ipcRenderer.on("updates:state", wrapped);
      return () => ipcRenderer.off("updates:state", wrapped);
    },
  },
});

// Hermes Phase 2 — local LLM. Separated namespace from electronAPI
// so call sites can feature-detect cleanly:
//
//   if (window.driftLocal) { ... use local pipeline ... }
//
// In the web (non-Electron) build, driftLocal is undefined and call
// sites fall back to the cloud OpenAI provider.
contextBridge.exposeInMainWorld("driftLocal", {
  /** Probe local Ollama. Returns { reachable, base_url,
   *  models_available, hermes_pulled }. Cached briefly by the
   *  privacy-mode UI; cheap to call. */
  probe: () => ipcRenderer.invoke("ollama:probe"),

  /** Open a multi-select file picker and read+extract text from
   *  each picked file. Bytes never leave the machine — only the
   *  extracted text crosses the IPC boundary. The Hermes direct-
   *  chat page uses this to attach files into the chat context. */
  pickAndReadFiles: () => ipcRenderer.invoke("hermes:pickAndReadFiles"),

  /** Complete a chat against local Ollama. Same shape as the
   *  server-side LlmProvider.complete result. */
  complete: (opts) => ipcRenderer.invoke("ollama:complete", opts),

  /** Compute embeddings against local Ollama. */
  embed: (opts) => ipcRenderer.invoke("ollama:embed", opts),

  /** Try to start Ollama if a binary is on disk but the server
   *  isn't running. Returns { started, reachable, reason? }. */
  ensureRunning: () => ipcRenderer.invoke("ollama:ensureRunning"),
});
