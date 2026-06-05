// lib/logging.ts
//
// Structured logger for Drift AI.
//
// In production (Vercel), emits single-line JSON that Vercel's log
// pipeline parses automatically — giving us structured search, level
// filtering, and context fields in the dashboard.
//
// In development, emits human-readable colored output.
//
// Usage:
//   import { log } from "@/lib/logging";
//
//   const wfLog = log.child({ component: "workflow-runner", runId });
//   wfLog.info("node executed", { nodeId, durationMs: 42 });
//   wfLog.error("node failed", { nodeId, error: err.message });

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum level — controlled by LOG_LEVEL env var, default "info" in
// production, "debug" in development.
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_PROD = process.env.NODE_ENV === "production";

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(entry: LogEntry): void {
  const { level, msg, ts, ...rest } = entry;

  if (IS_PROD) {
    // Vercel auto-parses JSON lines — one object per line.
    const out = JSON.stringify({ level, msg, ts, ...rest });
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
    return;
  }

  // Dev: colored human-readable output.
  const colors: Record<LogLevel, string> = {
    debug: "\x1b[90m",  // gray
    info: "\x1b[36m",   // cyan
    warn: "\x1b[33m",   // yellow
    error: "\x1b[31m",  // red
  };
  const reset = "\x1b[0m";
  const tag = `${colors[level]}[${level.toUpperCase()}]${reset}`;
  const ctx = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";

  if (level === "error") console.error(`${tag} ${msg}${ctx}`);
  else if (level === "warn") console.warn(`${tag} ${msg}${ctx}`);
  else console.log(`${tag} ${msg}${ctx}`);
}

// ── Logger class ──────────────────────────────────────────────────

export class Logger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  /** Create a child logger that inherits this logger's context. */
  child(extra: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...extra });
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this._log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this._log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this._log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this._log("error", msg, data);
  }

  private _log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;
    emit({
      level,
      msg,
      ts: new Date().toISOString(),
      ...this.context,
      ...data,
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────────

/** Root logger. Use `log.child({...})` for component-scoped loggers. */
export const log = new Logger({ app: "drift-ai" });
