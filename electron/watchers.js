// electron/watchers.js
//
// Chokidar-backed filesystem watcher for registered watched_folders.
// Lives in the Electron main process. When a new or modified file
// shows up in a watched folder, we:
//
//   1. Wait for write quiescence (chokidar's awaitWriteFinish), so
//      we don't try to hash a file that's still being copied.
//   2. SHA256-hash the file via streaming so we don't load big PDFs
//      into memory.
//   3. Send an IPC event to the renderer with the file metadata.
//      The renderer makes the actual notify-API call — that way
//      the existing Supabase session cookies authenticate the
//      request without us reimplementing auth in the main process.
//
// Folder-level filtering (allowed_extensions, size cap) is also
// applied server-side in the notify route; doing it here too is
// pure optimization to skip obvious-no's before bothering the
// network.

const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// folderId -> chokidar.FSWatcher
const watchers = new Map();
// folderId -> debounce timer per file path
const debouncers = new Map();

const HASH_CHUNK_HIGH_WATER = 1024 * 1024; // 1MB streaming chunks
const MAX_FILE_BYTES = 100 * 1024 * 1024; // server enforces same cap

/**
 * Replace the active set of watchers with the given folders list.
 * Idempotent — call this whenever the renderer re-fetches folders
 * from the server. Folders that disappeared are unwatched, new
 * ones are picked up, unchanged ones are left alone.
 */
function syncWatchers(folders, onFileEvent) {
  const desiredIds = new Set();
  for (const folder of folders) {
    if (folder.kind !== "local_electron") continue;
    if (folder.status !== "active") continue;
    desiredIds.add(folder.id);
    if (!watchers.has(folder.id)) startWatcher(folder, onFileEvent);
  }
  // Stop watchers for folders no longer in the desired set.
  for (const [id, w] of watchers.entries()) {
    if (!desiredIds.has(id)) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      watchers.delete(id);
    }
  }
}

function startWatcher(folder, onFileEvent) {
  const folderPath = folder.folder_path;
  if (!folderPath || !fs.existsSync(folderPath)) {
    console.warn(
      `[watchers] folder ${folder.id} path not accessible: ${folderPath}`,
    );
    return;
  }

  const allowed = (folder.allowed_extensions || []).map((e) =>
    e.toLowerCase().replace(/^\./, ""),
  );

  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    // ignoreInitial=false fires `add` events for files that already
    // exist when the watcher starts. Without this, a user who picks
    // an existing folder full of compliance docs sees nothing happen
    // — chokidar only notifies on changes, and the existing files
    // never become "new." Server-side dedup by SHA256 makes the
    // initial scan idempotent: re-registering the same folder
    // doesn't double-ingest anything.
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 200,
    },
    depth: 4, // don't recurse into deep nested junk
  });

  watcher.on("add", (filePath) =>
    handle(folder, filePath, "added", allowed, onFileEvent),
  );
  watcher.on("change", (filePath) =>
    handle(folder, filePath, "changed", allowed, onFileEvent),
  );
  watcher.on("error", (err) =>
    console.error(`[watchers] folder ${folder.id} error:`, err?.message || err),
  );

  watchers.set(folder.id, watcher);
  console.log(`[watchers] started: ${folder.id} -> ${folderPath}`);
}

async function handle(folder, filePath, kind, allowed, onFileEvent) {
  // Per-file debounce — if a file is written multiple times in quick
  // succession, only the last write produces an event. Mostly handled
  // by chokidar's awaitWriteFinish, but a 1.5s post-stability buffer
  // covers editor-temp-file shenanigans (Word's ~$.docx, vim swap, etc).
  const key = `${folder.id}::${filePath}`;
  if (debouncers.has(key)) clearTimeout(debouncers.get(key));
  debouncers.set(
    key,
    setTimeout(async () => {
      debouncers.delete(key);
      try {
        await processFile(folder, filePath, kind, allowed, onFileEvent);
      } catch (err) {
        console.error(`[watchers] processFile failed for ${filePath}:`, err);
      }
    }, 1500),
  );
}

async function processFile(folder, filePath, kind, allowed, onFileEvent) {
  const fileName = path.basename(filePath);
  const ext = (path.extname(fileName).slice(1) || "").toLowerCase();

  // Skip Office temp files, dotfiles, and obvious junk before hashing.
  if (
    fileName.startsWith(".") ||
    fileName.startsWith("~$") ||
    fileName.endsWith(".tmp") ||
    fileName.endsWith(".swp") ||
    fileName.endsWith(".part")
  ) {
    return;
  }

  if (allowed.length > 0 && !allowed.includes(ext)) {
    // Allow the server to log the rejection too — that's the audit
    // record. Send minimal metadata so the server-side rejected_*
    // status row is created even for skipped extensions.
    onFileEvent({
      folder_id: folder.id,
      file_path: filePath,
      file_name: fileName,
      file_extension: ext,
      file_size_bytes: null,
      content_sha256: null,
      kind_of_event: kind,
      precheck_skip: false,
    });
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    console.warn(`[watchers] stat failed for ${filePath}:`, err?.message);
    return;
  }
  if (!stat.isFile()) return;
  if (stat.size > MAX_FILE_BYTES) {
    onFileEvent({
      folder_id: folder.id,
      file_path: filePath,
      file_name: fileName,
      file_extension: ext,
      file_size_bytes: stat.size,
      content_sha256: null,
      kind_of_event: kind,
      precheck_skip: false,
    });
    return;
  }

  const sha256 = await hashFileSha256(filePath);

  onFileEvent({
    folder_id: folder.id,
    file_path: filePath,
    file_name: fileName,
    file_extension: ext,
    file_size_bytes: stat.size,
    content_sha256: sha256,
    kind_of_event: kind,
    precheck_skip: false,
  });
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath, {
      highWaterMark: HASH_CHUNK_HIGH_WATER,
    });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Recursive on-demand scan. Walks the folder tree with Node fs and
 * fires the same fileEvent the chokidar add handler would for every
 * file found. Bypasses chokidar's initial-scan entirely — useful
 * when FSEvents has gotten into a weird state after rapid
 * subscribe/unsubscribe cycles and chokidar stops reporting all
 * files.
 *
 * Reuses the same hash/extension/size logic as the live watcher,
 * so the server sees identical events to a chokidar add. Server-
 * side dedup by sha256 makes the scan idempotent.
 */
async function rescanFolder(folder, onFileEvent) {
  const folderPath = folder.folder_path;
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { ok: false, reason: "path_not_accessible" };
  }
  const allowed = (folder.allowed_extensions || []).map((e) =>
    e.toLowerCase().replace(/^\./, ""),
  );
  let scanned = 0;
  let queued = 0;

  async function walk(dir, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[watchers] readdir failed for ${dir}:`, err?.message);
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        scanned++;
        try {
          await processFile(folder, full, "rescan", allowed, onFileEvent);
          queued++;
        } catch (err) {
          console.warn(`[watchers] rescan processFile failed for ${full}:`, err?.message);
        }
      }
    }
  }

  await walk(folderPath, 0);
  return { ok: true, scanned, queued };
}

function stopAll() {
  for (const w of watchers.values()) {
    try {
      w.close();
    } catch {
      /* ignore */
    }
  }
  watchers.clear();
  for (const t of debouncers.values()) clearTimeout(t);
  debouncers.clear();
}

module.exports = { syncWatchers, rescanFolder, stopAll };
