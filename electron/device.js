// electron/device.js
//
// Persists a stable per-installation device_id and a human-friendly
// device_label. The watched_folders API needs both — the device_id
// is what gives Drift "this folder is being watched on Diane's
// laptop" granularity, and the label is what the SEC examiner sees
// when listing where files came from.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

let cached = null;

function load(userDataDir) {
  if (cached) return cached;
  const file = path.join(userDataDir, "device.json");
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.device_id) {
        cached = parsed;
        return cached;
      }
    }
  } catch {
    /* fall through to write a new one */
  }
  const fresh = {
    device_id: crypto.randomUUID(),
    device_label: defaultLabel(),
    created_at: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2), "utf8");
  } catch (err) {
    console.warn("[device] failed to persist device.json:", err?.message || err);
  }
  cached = fresh;
  return cached;
}

function defaultLabel() {
  const host = os.hostname() || "unknown-host";
  const platform =
    process.platform === "darwin"
      ? "Mac"
      : process.platform === "win32"
        ? "Windows"
        : "Linux";
  return `${platform} (${host})`;
}

module.exports = { load };
