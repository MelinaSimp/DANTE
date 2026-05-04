"use client";

// app/dante/hermes/HermesClient.tsx
//
// Direct-chat surface for local Hermes 3. Conversation is in-memory
// only; refreshing the page wipes it. That's intentional — the page
// exists for users who specifically want a model that hasn't been
// touched by Drift's cloud, and persisting to Drift's DB would
// undo that.
//
// File attachments work by stuffing extracted text into the system
// prompt as <attachment name="..."> blocks. Plain context-stuffing,
// not RAG — fine for the typical 1-3 attached compliance memos but
// we cap at 200k chars per file to avoid blowing up the context
// window on big PDFs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "system"; content: string };

type AttachedFile = {
  name: string;
  path: string;
  size: number;
  ext: string;
  text: string;
  error: string | null;
  truncated: boolean;
};

type ProbeResult = {
  reachable: boolean;
  base_url: string;
  models_available: string[];
  hermes_pulled: boolean;
};

const DEFAULT_SYSTEM = `You are Hermes 3, running locally on the user's machine via Ollama. Nothing in this conversation is sent to a remote server.

The user has chosen the local-only path because they don't want their content reaching a third party. Treat their attached files as confidential. Cite specific filenames when answering questions about them. If a question requires information that isn't in the conversation or attachments, say so plainly — do not invent.`;

export default function HermesClient() {
  const [isElectron, setIsElectron] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [model, setModel] = useState<string>("hermes3:8b");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM);
  const [showSystem, setShowSystem] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Capability detection ────────────────────────────────────
  useEffect(() => {
    setIsElectron(!!window.electronAPI?.isElectron);
    if (window.driftLocal?.probe) {
      window.driftLocal
        .probe()
        .then((p) => {
          setProbe(p);
          // Default model: Hermes if pulled, else first available.
          if (p.reachable) {
            const hermes = p.models_available.find((m) =>
              m.toLowerCase().startsWith("hermes"),
            );
            if (hermes) setModel(hermes);
            else if (p.models_available[0]) setModel(p.models_available[0]);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // ─── Actions ─────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!window.driftLocal?.complete) {
      alert("Local LLM bridge not available. Open this page from the Drift desktop app.");
      return;
    }
    setBusy(true);
    const newUser: Msg = { role: "user", content: text };
    const newMessages = [...messages, newUser];
    setMessages(newMessages);
    setInput("");

    // Build system prompt with any attached files inlined.
    const sys = buildSystemWithAttachments(systemPrompt, attached);

    try {
      const result = await window.driftLocal.complete({
        model,
        messages: [{ role: "system", content: sys }, ...newMessages],
        temperature: 0.5,
      });
      const reply: Msg = {
        role: "assistant",
        content: result.message?.content || "(empty response)",
      };
      setMessages((m) => [...m, reply]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `_Error reaching local Hermes: ${msg}_\n\nIs Ollama running? Try \`ollama serve\` in a terminal, or click "Start Ollama" below.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, model, attached, systemPrompt]);

  const tryStart = useCallback(async () => {
    if (!window.driftLocal?.ensureRunning) return;
    setBusy(true);
    try {
      const r = await window.driftLocal.ensureRunning();
      if (r.reachable && window.driftLocal?.probe) {
        const p = await window.driftLocal.probe();
        setProbe(p);
      } else {
        alert(
          `Couldn't start Ollama: ${r.reason || "unknown"}.\n\nIf it's not installed, download from ollama.com.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFiles = useCallback(async () => {
    if (!window.driftLocal?.pickAndReadFiles) return;
    const picked = await window.driftLocal.pickAndReadFiles();
    if (picked.length === 0) return;
    // Dedup by absolute path.
    setAttached((prev) => {
      const byPath = new Map(prev.map((p) => [p.path, p]));
      for (const f of picked) byPath.set(f.path, f);
      return [...byPath.values()];
    });
  }, []);

  const removeAttachment = useCallback((p: string) => {
    setAttached((prev) => prev.filter((f) => f.path !== p));
  }, []);

  const clearChat = useCallback(() => {
    if (messages.length > 0 && !confirm("Clear this conversation?")) return;
    setMessages([]);
  }, [messages.length]);

  // ─── Render ──────────────────────────────────────────────────
  const status = useMemo(() => {
    if (!isElectron) return { label: "Desktop only", tone: "muted" as const };
    if (!probe) return { label: "Probing…", tone: "muted" as const };
    if (!probe.reachable) return { label: "Ollama not running", tone: "warn" as const };
    if (!probe.hermes_pulled)
      return { label: "Hermes not pulled — run `ollama pull hermes3:8b`", tone: "warn" as const };
    return { label: `Connected · ${model} · local`, tone: "ok" as const };
  }, [isElectron, probe, model]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col h-[calc(100vh-4rem)]">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="heading-display text-2xl">Hermes</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            Talk directly to local Hermes 3. Nothing leaves your machine.
          </p>
        </div>
        <StatusPill {...status} />
      </header>

      {!isElectron && (
        <div className="border border-dashed border-[var(--rule)] rounded-md p-6 text-sm text-[var(--ink-muted)]">
          <strong className="text-[var(--ink)] block mb-1">
            Hermes runs in the desktop app
          </strong>
          <p>
            The local-LLM bridge isn&rsquo;t reachable from a browser tab — it
            talks to <code>localhost:11434</code> via Electron IPC. Install
            Drift from{" "}
            <a href="/download" className="text-[var(--accent)] hover:underline">
              /download
            </a>{" "}
            and reopen this page from there.
          </p>
        </div>
      )}

      {isElectron && probe && !probe.reachable && (
        <div className="mb-4 border border-amber-500/40 bg-amber-500/5 rounded-md p-4 text-sm">
          <p className="mb-2">
            Ollama isn&rsquo;t reachable at <code>{probe.base_url}</code>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={tryStart}
              className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90"
              disabled={busy}
            >
              Try to start Ollama
            </button>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30"
            >
              Install Ollama →
            </a>
          </div>
        </div>
      )}

      {isElectron && (
        <div className="mb-3 flex items-center gap-3 text-xs">
          {probe?.models_available && probe.models_available.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="px-2 py-1.5 rounded border border-[var(--rule)] bg-transparent"
            >
              {probe.models_available.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="px-2 py-1.5 rounded border border-[var(--rule)] bg-transparent w-48"
            />
          )}
          <button
            onClick={pickFiles}
            className="px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30"
            disabled={!isElectron}
          >
            + Attach file
          </button>
          <button
            onClick={() => setShowSystem((v) => !v)}
            className="px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30"
          >
            {showSystem ? "Hide" : "Show"} system prompt
          </button>
          <button
            onClick={clearChat}
            className="px-3 py-1.5 rounded border border-[var(--rule)] hover:bg-[var(--rule)]/30 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {showSystem && (
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="mb-3 w-full px-3 py-2 rounded border border-[var(--rule)] bg-transparent text-sm font-mono"
        />
      )}

      {attached.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attached.map((f) => (
            <span
              key={f.path}
              className="inline-flex items-center gap-2 px-2 py-1 rounded border border-[var(--rule)] text-xs bg-[var(--rule)]/10"
              title={`${f.path}\n${f.text.length} chars${f.truncated ? " (truncated to 200k)" : ""}${f.error ? `\nError: ${f.error}` : ""}`}
            >
              <span className="truncate max-w-[20ch]">{f.name}</span>
              <span className="text-[var(--ink-muted)]">
                {f.error
                  ? "error"
                  : f.truncated
                    ? `${Math.round(f.text.length / 1000)}k (trunc)`
                    : `${Math.round(f.text.length / 1000)}k chars`}
              </span>
              <button
                onClick={() => removeAttachment(f.path)}
                className="text-[var(--ink-muted)] hover:text-red-500"
                aria-label="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border border-[var(--rule)] rounded-md p-4 mb-3 space-y-4 min-h-[300px]"
      >
        {messages.length === 0 && (
          <div className="text-center text-sm text-[var(--ink-muted)] mt-12">
            Start a conversation. Anything you type or attach stays on this
            machine.
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        {busy && (
          <div className="text-sm text-[var(--ink-muted)] italic">
            Hermes is thinking…
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={
            isElectron
              ? "Ask Hermes anything. Attached files are in context."
              : "Open the desktop app to chat with Hermes."
          }
          disabled={!isElectron || busy}
          className="flex-1 px-3 py-2 rounded border border-[var(--rule)] bg-transparent text-sm focus-within:ring-1 focus-within:ring-[var(--accent)] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!isElectron || busy || !input.trim()}
          className="px-4 py-2 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--rule)]/20 text-[var(--ink)]"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : "bg-[var(--rule)]/30 text-[var(--ink-muted)] border-[var(--rule)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          tone === "ok"
            ? "bg-emerald-500"
            : tone === "warn"
              ? "bg-amber-500"
              : "bg-[var(--ink-muted)]"
        }`}
      />
      {label}
    </span>
  );
}

function buildSystemWithAttachments(base: string, files: AttachedFile[]): string {
  if (files.length === 0) return base;
  const blocks = files
    .filter((f) => !f.error && f.text)
    .map(
      (f) =>
        `<attachment name="${f.name}" ext="${f.ext}" chars="${f.text.length}"${
          f.truncated ? ' truncated="true"' : ""
        }>\n${f.text}\n</attachment>`,
    )
    .join("\n\n");
  return `${base}\n\nThe user has attached the following files. Their contents are below in <attachment> blocks. Cite filenames when answering questions about them.\n\n${blocks}`;
}
