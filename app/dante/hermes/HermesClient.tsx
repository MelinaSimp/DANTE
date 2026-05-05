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
import { ArrowUp, Paperclip, X } from "lucide-react";
import UpdatePromptCard from "@/components/desktop/UpdatePromptCard";

// Auto-resize hook for the composer textarea — grows with content
// up to maxHeight, then scrolls. Imported pattern from the v0
// composer; kept local because we only use it here.
function useAutoResize(min: number, max: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjust = useCallback(
    (reset?: boolean) => {
      const el = ref.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${min}px`;
        return;
      }
      el.style.height = `${min}px`;
      const next = Math.max(min, Math.min(el.scrollHeight, max));
      el.style.height = `${next}px`;
    },
    [min, max],
  );
  useEffect(() => {
    if (ref.current) ref.current.style.height = `${min}px`;
  }, [min]);
  return { ref, adjust };
}

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
  const [hasBridge, setHasBridge] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [model, setModel] = useState<string>("hermes3:8b");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM);
  const [showSystem, setShowSystem] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: textareaRef, adjust: adjustHeight } = useAutoResize(56, 220);

  // ─── Capability detection ────────────────────────────────────
  useEffect(() => {
    setIsElectron(!!window.electronAPI?.isElectron);
    setHasBridge(!!window.driftLocal?.probe);
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
    adjustHeight(true);

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
    if (!hasBridge)
      return { label: "Update Drift to use Hermes", tone: "warn" as const };
    if (!probe) return { label: "Probing…", tone: "muted" as const };
    if (!probe.reachable) return { label: "Ollama not running", tone: "warn" as const };
    if (!probe.hermes_pulled)
      return { label: "Hermes not pulled — run `ollama pull hermes3:8b`", tone: "warn" as const };
    return { label: `Connected · ${model} · local`, tone: "ok" as const };
  }, [isElectron, hasBridge, probe, model]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col h-[calc(100vh-4rem)]">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mono text-[11px] text-[var(--ink-muted)] mb-1 uppercase tracking-wide">
            Local AI · on-device
          </div>
          <h1 className="heading-display text-4xl md:text-5xl text-[var(--ink)] leading-tight">
            Hermes
          </h1>
          <p className="text-sm text-[var(--ink-muted)] mt-2 max-w-xl leading-relaxed">
            Talk directly to local Hermes 3. Anything you type, ask, or attach
            stays on this machine — nothing routes through Drift&rsquo;s servers.
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

      {isElectron && !hasBridge && <UpdatePromptCard />}

      {isElectron && hasBridge && probe && !probe.reachable && (
        <div className="mb-5 border border-[var(--rule)] rounded-md p-5">
          <div className="mono text-[11px] text-[var(--ink-muted)] mb-2 uppercase tracking-wide">
            Ollama not reachable
          </div>
          <p className="text-sm text-[var(--ink)] mb-1">
            Drift can&rsquo;t reach Ollama at <code className="mono text-[12px]">{probe.base_url}</code>.
          </p>
          <p className="text-sm text-[var(--ink-muted)] mb-4 leading-relaxed">
            Hermes runs through Ollama, a local model server. Install it once
            (~150 MB), pull the model, and Drift connects automatically — no
            sign-in, no API key.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={tryStart}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 text-sm font-medium transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? "Trying…" : "Try to start Ollama"}
            </button>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--rule)] px-4 py-2 text-sm font-medium hover:bg-[var(--rule)]/30 transition"
            >
              Install Ollama →
            </a>
          </div>
        </div>
      )}

      {/* Auxiliary controls — model picker + system prompt + clear,
          intentionally lightweight so the eye lands on the composer. */}
      {isElectron && hasBridge && (
        <div className="mb-4 flex items-center gap-3 text-xs">
          <div className="inline-flex items-center gap-2">
            <span className="mono text-[11px] text-[var(--ink-muted)] uppercase tracking-wide">
              Model
            </span>
            {probe?.models_available && probe.models_available.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-[6px] border border-[var(--rule)] bg-transparent px-2 py-1 text-xs focus:outline-none focus:border-[var(--ink)]"
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
                className="rounded-[6px] border border-[var(--rule)] bg-transparent px-2 py-1 text-xs w-40 focus:outline-none focus:border-[var(--ink)]"
              />
            )}
          </div>
          <button
            onClick={() => setShowSystem((v) => !v)}
            className="mono text-[11px] uppercase tracking-wide text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            {showSystem ? "Hide system prompt" : "Show system prompt"}
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="ml-auto mono text-[11px] uppercase tracking-wide text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
            >
              Clear conversation
            </button>
          )}
        </div>
      )}

      {showSystem && (
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="mb-4 w-full px-3 py-2 rounded-[6px] border border-[var(--rule)] bg-[var(--canvas)] text-xs font-mono focus:outline-none focus:border-[var(--ink)]"
        />
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 mb-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="mono text-[11px] text-[var(--ink-muted)] uppercase tracking-wide mb-3">
              On-device · private
            </div>
            <p className="text-sm text-[var(--ink-muted)] max-w-md leading-relaxed">
              Start a conversation. Anything you type or attach stays on this
              machine — nothing is sent to Drift&rsquo;s servers, OpenAI, or
              any third party.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--canvas)] px-3.5 py-2.5 text-sm text-[var(--ink-muted)] italic">
              Hermes is thinking…
            </div>
          </div>
        )}
      </div>

      {/* Unified composer card: textarea on top, attach + send buttons
          inline at the bottom. Pattern adapted from the v0 chat input
          (https://v0.dev/chat) — kept structural ideas (one card,
          inline actions, auto-resize), discarded the dark skin since
          Drift's design language is light/serif. */}
      <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--canvas)] focus-within:border-[var(--ink)] transition-colors shadow-sm">
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attached.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule)] bg-[var(--rule)]/10 pl-2.5 pr-1.5 py-1 text-xs"
                title={`${f.path}\n${f.text.length} chars${f.truncated ? " (truncated to 200k)" : ""}${f.error ? `\nError: ${f.error}` : ""}`}
              >
                <span className="truncate max-w-[20ch]">{f.name}</span>
                <span className="mono text-[10px] text-[var(--ink-muted)]">
                  {f.error
                    ? "error"
                    : `${Math.round(f.text.length / 1000)}k${f.truncated ? "*" : ""}`}
                </span>
                <button
                  onClick={() => removeAttachment(f.path)}
                  className="rounded-full p-0.5 text-[var(--ink-muted)] hover:bg-[var(--rule)]/40 hover:text-[var(--ink)] transition"
                  aria-label="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            !isElectron
              ? "Open the desktop app to chat with Hermes."
              : !hasBridge
                ? "Update Drift to v1.1.0 to chat with Hermes."
                : "Ask Hermes anything. Attached files are in context."
          }
          disabled={!isElectron || !hasBridge || busy}
          className="w-full px-4 py-3 bg-transparent text-sm focus:outline-none disabled:opacity-50 resize-none placeholder:text-[var(--ink-muted)]"
          style={{ minHeight: 56, overflow: "hidden" }}
        />

        <div className="flex items-center justify-between gap-2 px-2 py-2 border-t border-[var(--rule)]">
          <button
            onClick={pickFiles}
            disabled={!isElectron || !hasBridge}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--ink-muted)] hover:bg-[var(--rule)]/30 hover:text-[var(--ink)] transition disabled:opacity-50"
            aria-label="Attach files"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Attach</span>
          </button>
          <button
            onClick={send}
            disabled={!isElectron || !hasBridge || busy || !input.trim()}
            aria-label="Send message"
            className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition active:scale-95 disabled:opacity-40 ${
              input.trim() && !busy
                ? "bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90"
                : "bg-[var(--rule)]/40 text-[var(--ink-muted)]"
            }`}
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[80%] rounded-[10px] px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? "bg-[var(--ink)] text-[var(--canvas)]"
            : "border border-[var(--rule)] bg-[var(--canvas)] text-[var(--ink)]"
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
