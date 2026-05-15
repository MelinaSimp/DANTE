"use client";

import { useEffect, useState } from "react";
import {
  FolderOpen,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Terminal,
  Cpu,
  RefreshCw,
} from "lucide-react";

interface WatchedFolder {
  id: string;
  folder_path: string;
  folder_label: string;
  status: string;
  watcher_token: string | null;
  token_expires_at: string | null;
  last_seen_at: string | null;
  files_indexed_count: number;
  device_label: string | null;
}

interface OllamaStatus {
  reachable: boolean;
  hermes_pulled: boolean;
  models_available: string[];
}

interface SetupData {
  folders: WatchedFolder[];
  ollama: OllamaStatus;
}

export default function LocalSetupCard() {
  const [data, setData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    fetch("/api/settings/local-setup", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
        Probing local services…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-amber-700 flex items-center gap-2">
        <AlertCircle className="h-3 w-3" strokeWidth={1.5} />
        Failed to load local setup status.
      </div>
    );
  }

  const activeFolders = data.folders.filter((f) => f.status === "active");

  return (
    <div className="space-y-8">
      <OllamaSection ollama={data.ollama} onRefresh={reload} />
      <WatcherSection folders={activeFolders} />
    </div>
  );
}

function OllamaSection({ ollama, onRefresh }: { ollama: OllamaStatus; onRefresh: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="label-section">Ollama (local AI)</div>
        <button
          onClick={onRefresh}
          className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition p-1"
          title="Refresh status"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--ink-muted)] mb-3">
        Ollama runs AI models locally on this machine. Required for
        privacy mode (local-only processing). Install it once and Drift
        handles the rest.
      </p>

      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 text-[12px] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-muted)]">Status</span>
          <StatusDot ok={ollama.reachable} label={ollama.reachable ? "running" : "not detected"} />
        </div>
        {ollama.reachable && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-muted)]">Hermes 3 model</span>
            <StatusDot ok={ollama.hermes_pulled} label={ollama.hermes_pulled ? "ready" : "not pulled"} />
          </div>
        )}
        {ollama.reachable && ollama.models_available.length > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--ink-muted)]">Models</span>
            <span className="mono text-[var(--ink-subtle)]">{ollama.models_available.join(", ")}</span>
          </div>
        )}
      </div>

      {!ollama.reachable && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] text-[var(--ink-muted)]">
            Install Ollama, then pull the Hermes 3 model:
          </p>
          <div className="space-y-1.5">
            <InstallCommand
              label="macOS / Linux"
              command="curl -fsSL https://ollama.com/install.sh | sh && ollama pull hermes3:8b"
            />
            <InstallCommand
              label="Windows"
              command="winget install Ollama.Ollama && ollama pull hermes3:8b"
            />
          </div>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline underline-offset-2"
          >
            ollama.com/download
            <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
          </a>
        </div>
      )}
      {ollama.reachable && !ollama.hermes_pulled && (
        <div className="mt-3">
          <p className="text-[12px] text-[var(--ink-muted)] mb-1.5">
            Ollama is running but the Hermes 3 model needs to be pulled:
          </p>
          <InstallCommand label="Pull model" command="ollama pull hermes3:8b" />
        </div>
      )}
    </div>
  );
}

function WatcherSection({ folders }: { folders: WatchedFolder[] }) {
  return (
    <div>
      <div className="label-section mb-2">Drift Watcher (file sync daemon)</div>
      <p className="text-[12px] leading-relaxed text-[var(--ink-muted)] mb-3">
        The watcher runs in the background and syncs files from watched
        folders into Drift. Install it as a system service so it starts
        automatically on boot and restarts after crashes.
      </p>

      {folders.length === 0 ? (
        <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 text-[12px] text-[var(--ink-muted)]">
          No active watched folders. Add a folder from the Drift desktop app or the
          Vault settings to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {folders.map((f) => (
            <FolderInstallCard key={f.id} folder={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderInstallCard({ folder }: { folder: WatchedFolder }) {
  const folderName = folder.folder_label || folder.folder_path.split("/").pop() || folder.folder_path;
  const lastSeen = folder.last_seen_at
    ? new Date(folder.last_seen_at).toLocaleDateString()
    : "never";
  const expired = folder.token_expires_at && new Date(folder.token_expires_at) < new Date();

  const macCmd = folder.watcher_token
    ? `cd ~/drift-crm/cli/drift-watcher && ./service/install.sh ${folder.watcher_token} "${folder.folder_path}"`
    : null;

  return (
    <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3 text-[12px]">
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen className="h-3.5 w-3.5 text-[var(--ink-muted)]" strokeWidth={1.5} />
        <span className="font-medium text-[var(--ink)]">{folderName}</span>
        <span className="text-[var(--ink-subtle)] mono">{folder.files_indexed_count} files</span>
      </div>

      <div className="flex items-center gap-4 text-[var(--ink-muted)] mb-2">
        <span>Path: <span className="mono">{folder.folder_path}</span></span>
      </div>
      <div className="flex items-center gap-4 text-[var(--ink-muted)] mb-3">
        <span>Last seen: <span className="mono">{lastSeen}</span></span>
        {expired && (
          <span className="text-amber-700 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" strokeWidth={1.5} />
            Token expired
          </span>
        )}
      </div>

      {macCmd ? (
        <div>
          <div className="text-[var(--ink-muted)] mb-1">Install as service (run once):</div>
          <InstallCommand label="macOS / Linux" command={macCmd} />
        </div>
      ) : (
        <div className="text-amber-700 flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" strokeWidth={1.5} />
          No watcher token — re-activate this folder to generate one.
        </div>
      )}
    </div>
  );
}

function InstallCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--canvas-subtle)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
          <Terminal className="h-3 w-3" strokeWidth={1.5} />
          {label}
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent)] transition"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" strokeWidth={1.5} />
              <span className="text-emerald-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.5} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="px-3 py-2 text-[11px] mono leading-relaxed text-[var(--ink)] overflow-x-auto whitespace-pre-wrap break-all">
        {command}
      </pre>
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className={`mono ${ok ? "text-emerald-700" : "text-amber-700"}`}>{label}</span>
    </span>
  );
}
