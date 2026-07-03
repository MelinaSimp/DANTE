"use client";

// /widget/[agentId] — the standalone, public, embeddable chat surface.
//
// This is what loads inside the iframe injected by /widget.js, and it
// also works as a plain shareable link. The `[agentId]` segment is the
// agent's widget_public_id (the rotatable token), never the internal
// UUID. Fully self-contained: it talks only to the public
// /api/widget/[id]/config + /chat endpoints, keeps no auth, and stores
// the conversation + visitor id in localStorage so a returning visitor
// resumes their thread.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface WidgetConfig {
  name: string;
  greeting: string;
  title: string;
  subtitle: string | null;
  primary_color: string;
  position: "bottom-right" | "bottom-left";
  launcher_text: string | null;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

// Stable per-browser visitor id so threads resume across reloads.
function getVisitorId(publicId: string): string {
  const key = `dante_widget_visitor_${publicId}`;
  try {
    let v = localStorage.getItem(key);
    if (!v) {
      v = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

export default function WidgetPage() {
  const params = useParams();
  const publicId = String(params.agentId || "");

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load branding + greeting.
  useEffect(() => {
    if (!publicId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/widget/${publicId}/config`);
        if (!r.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const cfg = (await r.json()) as WidgetConfig;
        if (cancelled) return;
        setConfig(cfg);
        setMessages([{ role: "assistant", content: cfg.greeting }]);
        // Resume a prior conversation if we have one.
        try {
          const saved = localStorage.getItem(`dante_widget_conv_${publicId}`);
          if (saved) convIdRef.current = saved;
        } catch {}
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setThinking(null);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", pending: true }]);

    try {
      const res = await fetch(`/api/widget/${publicId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: convIdRef.current,
          visitor_id: getVisitorId(publicId),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = res.status === 429 ? "You're sending messages too quickly. Please wait a moment." : "Something went wrong. Please try again.";
        setMessages((m) => replaceLast(m, errText));
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalContent = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          const type = evt.type as string;
          if (type === "conversation_started" && typeof evt.conversation_id === "string") {
            convIdRef.current = evt.conversation_id;
            try {
              localStorage.setItem(`dante_widget_conv_${publicId}`, evt.conversation_id);
            } catch {}
          } else if (type === "tool_start" && typeof evt.tool_name === "string") {
            setThinking(labelForTool(evt.tool_name));
          } else if (type === "final") {
            finalContent = (evt.content as string) || finalContent;
          }
        }
      }

      setThinking(null);
      setMessages((m) => replaceLast(m, finalContent || "Sorry, I couldn't produce a response. Please try again."));
    } catch {
      setThinking(null);
      setMessages((m) => replaceLast(m, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [input, busy, publicId]);

  if (notFound) {
    return (
      <div className="flex h-screen items-center justify-center bg-white p-6 text-center text-sm text-neutral-500">
        This chat isn&apos;t available.
      </div>
    );
  }

  const accent = config?.primary_color || "#4F46E5";

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3" style={{ background: accent }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
          {(config?.name || "A").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{config?.title || "Assistant"}</div>
          {config?.subtitle && <div className="truncate text-xs text-white/80">{config.subtitle}</div>}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user" ? "text-white" : "bg-neutral-100 text-neutral-800"
              }`}
              style={m.role === "user" ? { background: accent } : undefined}
            >
              {m.content || (m.pending ? <TypingDots /> : "")}
            </div>
          </div>
        ))}
        {thinking && <div className="px-1 text-xs text-neutral-400">{thinking}</div>}
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-200 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Type your message…"
            className="max-h-32 flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            Send
          </button>
        </form>
        <div className="mt-1.5 text-center text-[10px] text-neutral-300">Powered by Dante</div>
      </div>
    </div>
  );
}

function replaceLast(m: Msg[], content: string): Msg[] {
  const copy = m.slice();
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === "assistant") {
      copy[i] = { role: "assistant", content };
      break;
    }
  }
  return copy;
}

function labelForTool(tool: string): string {
  if (tool.includes("vault") || tool.includes("archive")) return "Searching documents…";
  return "Thinking…";
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
    </span>
  );
}
