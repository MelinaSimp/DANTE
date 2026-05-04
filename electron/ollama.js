// electron/ollama.js
//
// Manages the local Ollama runtime for Hermes 3. Phase 2 strategy:
// detect a system-installed Ollama via the standard install paths
// (Homebrew on Mac, the official Windows installer, etc.). If
// reachable on localhost:11434, we use it. If not, the Privacy
// Mode panel surfaces a setup link and the user is in cloud-only
// mode by default.
//
// Why "detect, not bundle" for Phase 2:
//   • The Ollama server binary is ~150MB per platform. Bundling
//     triples the DMG size and breaks code-signing flows we'd
//     rather not touch this sprint.
//   • Ollama auto-updates itself, so a bundled-and-frozen copy
//     drifts behind upstream and we'd own a maintenance loop we
//     don't need to.
//   • Most early Drift users will already have it (developers,
//     security-conscious advisors who installed it for other
//     reasons, etc.); for the rest we point them at the official
//     installer and ask them to come back.
//
// Phase 3 reconsideration: bundle if the install-friction is
// killing privacy-mode adoption. The interface this module
// exposes won't change — only the bootstrap.

const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const fs = require("fs");

const OLLAMA_BASE_URL = process.env.HERMES_BASE_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.HERMES_DEFAULT_MODEL || "hermes3:8b";

/** Probe Ollama. Returns reachability + which models are pulled.
 *  Keeps the timeout short — the renderer calls this on every
 *  privacy-mode panel render and we don't want to block it. */
async function probe() {
  try {
    const res = await fetchJson(`${OLLAMA_BASE_URL}/api/tags`, { timeoutMs: 1500 });
    const models = (res?.models || []).map((m) => m.name);
    return {
      reachable: true,
      base_url: OLLAMA_BASE_URL,
      models_available: models,
      hermes_pulled: models.some((m) => m.toLowerCase().startsWith("hermes")),
    };
  } catch (err) {
    return {
      reachable: false,
      base_url: OLLAMA_BASE_URL,
      models_available: [],
      hermes_pulled: false,
      error: err?.message || String(err),
    };
  }
}

/** Run a chat-completion against local Ollama. Same shape as the
 *  server-side HermesProvider.complete so the preload bridge can
 *  expose it field-for-field-compatible with the cloud path. */
async function complete({ messages, model, temperature, responseFormat }) {
  const body = {
    model: model || DEFAULT_MODEL,
    messages: (messages || [])
      .filter((m) => m.role !== "tool")
      .map((m) => ({ role: m.role, content: m.content || "" })),
    stream: false,
  };
  if (typeof temperature === "number") body.options = { temperature };
  if (responseFormat?.type === "json_object") body.format = "json";

  const res = await fetchJson(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    body,
    timeoutMs: 60_000,
  });
  if (!res?.message) throw new Error("Ollama returned no message");

  return {
    message: { role: "assistant", content: res.message.content || "" },
    finishReason: res.done_reason ?? "stop",
    usage: {
      promptTokens: res.prompt_eval_count ?? 0,
      completionTokens: res.eval_count ?? 0,
      totalTokens: (res.prompt_eval_count ?? 0) + (res.eval_count ?? 0),
    },
  };
}

/** Compute embeddings via Ollama. Issues sequentially since
 *  Ollama's /api/embeddings doesn't batch. Caller should keep
 *  inputs small. */
async function embed({ input, model }) {
  const inputs = Array.isArray(input) ? input : [input];
  const m = model || process.env.HERMES_DEFAULT_EMBED_MODEL || "nomic-embed-text";
  const out = [];
  for (const i of inputs) {
    const r = await fetchJson(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: "POST",
      body: { model: m, prompt: i },
      timeoutMs: 30_000,
    });
    if (!r?.embedding) throw new Error("Ollama embed: no embedding returned");
    out.push(r.embedding);
  }
  return out;
}

/** Find an Ollama binary on disk to start the server if it's not
 *  already running. Best-effort — if we can't find it, return null
 *  and let the UI direct the user to install it. */
function findOllamaBinary() {
  const candidates = [
    "/usr/local/bin/ollama",
    "/opt/homebrew/bin/ollama",
    "/Applications/Ollama.app/Contents/Resources/ollama",
    "C:\\Program Files\\Ollama\\ollama.exe",
    "C:\\Users\\Public\\Ollama\\ollama.exe",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Try to start the Ollama server if a binary is on disk and the
 *  server isn't already up. Returns true if we started it (or it
 *  was already running), false otherwise. The child is detached
 *  so it survives the Electron app exiting — Ollama is a daemon. */
async function ensureRunning() {
  const initial = await probe();
  if (initial.reachable) return { started: false, reachable: true };

  const bin = findOllamaBinary();
  if (!bin) {
    return { started: false, reachable: false, reason: "binary_not_found" };
  }

  try {
    const child = spawn(bin, ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    return {
      started: false,
      reachable: false,
      reason: "spawn_failed",
      error: err?.message || String(err),
    };
  }

  // Poll until reachable or 10s timeout.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await sleep(500);
    const p = await probe();
    if (p.reachable) return { started: true, reachable: true };
  }
  return { started: false, reachable: false, reason: "did_not_come_up" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Minimal fetch helper — Node 20 has global fetch but we want
 *  per-call timeouts and JSON convenience. */
function fetchJson(url, { method = "GET", body, timeoutMs = 5_000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
          try {
            resolve(raw ? JSON.parse(raw) : null);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = {
  probe,
  complete,
  embed,
  ensureRunning,
  findOllamaBinary,
  OLLAMA_BASE_URL,
  DEFAULT_MODEL,
};
