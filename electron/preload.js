const { contextBridge, ipcRenderer } = require("electron");

// Drift's renderer-side surface. Anything reachable on window.electronAPI
// is sandbox-safe — preload runs with contextIsolation=true, so the
// renderer never gets a Node handle directly.
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
});
