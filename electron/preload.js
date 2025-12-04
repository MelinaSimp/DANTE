// Preload script - runs in isolated context
// Can expose safe APIs to renderer process if needed

const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// APIs without exposing the entire Node.js API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});









