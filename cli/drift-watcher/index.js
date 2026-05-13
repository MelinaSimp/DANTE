#!/usr/bin/env node
//
// drift-watcher — headless file watcher daemon for Drift AI.
//
// Watches a local folder for new/changed files, extracts text,
// and pushes them to the Drift API for indexing. Runs without
// Electron, a GUI, or a logged-in user — ideal for file servers,
// NAS boxes, and always-on workstations with terabytes of data.
//
// Usage:
//   drift-watcher --token <watcher_token> --folder /path/to/watch [options]
//
// Options:
//   --token    Watcher token from Drift (generate in Settings → Watched Folders)
//   --folder   Path to watch
//   --api-url  Drift API URL (default: https://driftai.studio)
//   --depth    Max directory recursion depth (default: 8)
//   --extensions  Comma-separated allowed extensions (default: all)
//   --dry-run  Log what would be sent without actually calling the API

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const chokidar = require("chokidar");
const { extractText } = require("./extract");
const { createClient } = require("./api");

const HASH_CHUNK_HIGH_WATER = 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const DEBOUNCE_MS = 1500;
const CONCURRENCY = 4;

// ── CLI arg parsing ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    token: null,
    folder: null,
    apiUrl: "https://driftai.studio",
    depth: 8,
    extensions: [],
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--token":
        opts.token = args[++i];
        break;
      case "--folder":
        opts.folder = args[++i];
        break;
      case "--api-url":
        opts.apiUrl = args[++i];
        break;
      case "--depth":
        opts.depth = parseInt(args[++i], 10);
        break;
      case "--extensions":
        opts.extensions = args[++i].split(",").map((e) => e.trim().toLowerCase().replace(/^\./, ""));
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        log(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!opts.token) {
    log("Error: --token is required");
    printUsage();
    process.exit(1);
  }
  if (!opts.folder) {
    log("Error: --folder is required");
    printUsage();
    process.exit(1);
  }
  if (!fs.existsSync(opts.folder)) {
    log(`Error: folder does not exist: ${opts.folder}`);
    process.exit(1);
  }

  return opts;
}

function printUsage() {
  console.log(`
drift-watcher — Headless file watcher for Drift AI

Usage:
  drift-watcher --token <token> --folder <path> [options]

Options:
  --token <token>       Watcher token (from Drift Settings → Watched Folders)
  --folder <path>       Local folder to watch
  --api-url <url>       Drift API URL (default: https://driftai.studio)
  --depth <n>           Max recursion depth (default: 8)
  --extensions <list>   Comma-separated extensions, e.g. "pdf,docx,txt"
  --dry-run             Log events without calling the API
  --help                Show this help
`);
}

// ── Logging ────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[drift-watcher ${ts}] ${msg}`);
}

// ── File processing ────────────────────────────────────────────

const debouncers = new Map();
let activeExtracts = 0;
const extractQueue = [];

function hashFile(filePath) {
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

function isJunkFile(fileName) {
  return (
    fileName.startsWith(".") ||
    fileName.startsWith("~$") ||
    fileName.endsWith(".tmp") ||
    fileName.endsWith(".swp") ||
    fileName.endsWith(".part")
  );
}

async function processAndSend(filePath, kind, opts, api) {
  const fileName = path.basename(filePath);
  const ext = (path.extname(fileName).slice(1) || "").toLowerCase();

  if (isJunkFile(fileName)) return;

  if (opts.extensions.length > 0 && !opts.extensions.includes(ext)) {
    log(`skip (extension): ${filePath}`);
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  if (!stat.isFile()) return;

  if (stat.size > MAX_FILE_BYTES) {
    log(`skip (too large ${(stat.size / 1e9).toFixed(1)}GB): ${filePath}`);
    return;
  }

  const sha256 = await hashFile(filePath);

  // Extract text with concurrency limit
  let extractedText = "";
  try {
    const result = await withConcurrencyLimit(async () => {
      return extractText(filePath);
    });
    if (result.text) extractedText = result.text;
  } catch (err) {
    log(`extract failed for ${filePath}: ${err.message}`);
  }

  const payload = {
    file_path: filePath,
    file_name: fileName,
    file_extension: ext,
    file_size_bytes: stat.size,
    content_sha256: sha256,
    extracted_text: extractedText || undefined,
  };

  if (opts.dryRun) {
    log(`[dry-run] would send: ${fileName} (${ext}, ${(stat.size / 1024).toFixed(0)}KB, sha256=${sha256.slice(0, 12)}…, text=${extractedText.length} chars)`);
    return;
  }

  try {
    const res = await api.notify(payload);
    if (res.status === 200 || res.status === 201) {
      const action = res.data?.next_action || "ok";
      log(`${action}: ${fileName} (${(stat.size / 1024).toFixed(0)}KB, ${extractedText.length} chars text)`);
    } else {
      log(`API ${res.status}: ${fileName} — ${JSON.stringify(res.data)}`);
    }
  } catch (err) {
    log(`API error for ${fileName}: ${err.message}`);
  }
}

function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      activeExtracts++;
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      } finally {
        activeExtracts--;
        if (extractQueue.length > 0) {
          const next = extractQueue.shift();
          next();
        }
      }
    };
    if (activeExtracts < CONCURRENCY) {
      run();
    } else {
      extractQueue.push(run);
    }
  });
}

// ── Initial scan (mtime-sorted) ───────────────────────────────

async function initialScan(folderPath, opts, api) {
  log(`scanning ${folderPath} (depth=${opts.depth})…`);
  const allFiles = [];

  function collect(dir, depth) {
    if (depth > opts.depth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        collect(full, depth + 1);
      } else if (ent.isFile()) {
        try {
          const stat = fs.statSync(full);
          allFiles.push({ path: full, mtime: stat.mtimeMs });
        } catch {
          allFiles.push({ path: full, mtime: 0 });
        }
      }
    }
  }

  collect(folderPath, 0);
  allFiles.sort((a, b) => b.mtime - a.mtime);
  log(`found ${allFiles.length} files, processing newest first`);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let processed = 0;

  for (const file of allFiles) {
    await processAndSend(file.path, "scan", opts, api);
    processed++;
    if (processed % 50 === 0) {
      log(`progress: ${processed}/${allFiles.length} files`);
      await sleep(250);
    } else {
      await sleep(25);
    }
  }

  log(`initial scan complete: ${allFiles.length} files processed`);
}

// ── Live watcher ───────────────────────────────────────────────

function startLiveWatcher(folderPath, opts, api) {
  log(`starting live watcher on ${folderPath}`);

  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true, // initial scan handled separately above
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 200,
    },
    depth: opts.depth,
  });

  function debounced(filePath, kind) {
    if (debouncers.has(filePath)) clearTimeout(debouncers.get(filePath));
    debouncers.set(
      filePath,
      setTimeout(async () => {
        debouncers.delete(filePath);
        try {
          await processAndSend(filePath, kind, opts, api);
        } catch (err) {
          log(`process error: ${filePath}: ${err.message}`);
        }
      }, DEBOUNCE_MS),
    );
  }

  watcher.on("add", (fp) => debounced(fp, "added"));
  watcher.on("change", (fp) => debounced(fp, "changed"));
  watcher.on("error", (err) => log(`watcher error: ${err.message || err}`));

  return watcher;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const api = createClient({ apiUrl: opts.apiUrl, token: opts.token });

  log(`drift-watcher v1.0.0`);
  log(`folder:  ${opts.folder}`);
  log(`api:     ${opts.apiUrl}`);
  log(`depth:   ${opts.depth}`);
  log(`exts:    ${opts.extensions.length ? opts.extensions.join(", ") : "(all)"}`);
  log(`dry-run: ${opts.dryRun}`);
  log("");

  await initialScan(opts.folder, opts, api);

  const watcher = startLiveWatcher(opts.folder, opts, api);

  log("live watcher active — press Ctrl+C to stop");

  process.on("SIGINT", () => {
    log("shutting down…");
    watcher.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("shutting down…");
    watcher.close();
    process.exit(0);
  });
}

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(1);
});
