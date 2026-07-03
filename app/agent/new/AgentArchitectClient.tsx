"use client";

// The "Build by Chatting" surface. Left: a chat with the Agent
// Architect. Right: a live preview of the blueprint it's assembling.
// When the architect marks the design ready (and the user is happy),
// "Create agent" POSTs the blueprint and redirects to the full editor.

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, Loader2, Sparkles, Wrench, Puzzle } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Blueprint {
  name: string;
  description: string;
  persona: string;
  first_message: string;
  model: string;
  skills: string[];
  tools: string[];
}

const EMPTY_BLUEPRINT: Blueprint = {
  name: "",
  description: "",
  persona: "",
  first_message: "",
  model: "claude-sonnet-4-6",
  skills: [],
  tools: [],
};

const GREETING =
  "Hi — I'm the Agent Architect. Describe the agent you want (what it does, who it talks to, what it should and shouldn't do) and I'll build it with you.";

export default function AgentArchitectClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [blueprint, setBlueprint] = useState<Blueprint>(EMPTY_BLUEPRINT);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setError(null);
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);
    try {
      // Send the transcript WITHOUT the local greeting (it's UI-only).
      const transcript = nextMessages.filter(
        (m, i) => !(i === 0 && m.role === "assistant" && m.content === GREETING),
      );
      const res = await fetch("/api/agents/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Architect failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setBlueprint(data.blueprint);
      setReady(Boolean(data.ready));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages]);

  const create = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/from-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.details?.join(" ") || body?.error || "Could not create agent");
      }
      const { id } = await res.json();
      router.push(`/agent/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create agent");
      setCreating(false);
    }
  }, [blueprint, creating, router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/agent" className="inline-flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      <h1 className="heading-display mt-3 text-3xl">Build an agent</h1>
      <p className="mt-1 text-[var(--ink-muted)]">
        Describe what you want. Dante designs it with you.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Chat column */}
        <div className="flex flex-col rounded-xl border border-[var(--rule)] bg-[var(--canvas)]">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-[var(--canvas)]"
                    : "mr-auto max-w-[85%] rounded-lg bg-[var(--canvas-subtle)] px-3 py-2 text-sm"
                }
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div className="mr-auto flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Designing…
              </div>
            )}
          </div>
          <div className="border-t border-[var(--rule)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="e.g. A support agent for my plumbing company that can book appointments…"
                className="flex-1 resize-none rounded-lg border border-[var(--rule)] bg-transparent px-3 py-2 text-sm focus:outline-none"
              />
              <button
                onClick={send}
                disabled={thinking || !input.trim()}
                className="inline-flex h-10 items-center gap-1 rounded-lg bg-[var(--ink)] px-3 text-sm text-[var(--canvas)] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Preview column */}
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--canvas)] p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4" /> Live preview
          </div>

          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-[var(--ink-muted)]">Name</dt>
              <dd className="mt-0.5 font-medium">{blueprint.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Description</dt>
              <dd className="mt-0.5">{blueprint.description || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Greeting</dt>
              <dd className="mt-0.5">{blueprint.first_message || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Model</dt>
              <dd className="mt-0.5 font-mono text-xs">{blueprint.model}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-muted)]">Persona</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[var(--ink-muted)]" style={{ maxHeight: "10rem", overflowY: "auto" }}>
                {blueprint.persona || "—"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[var(--ink-muted)]"><Puzzle className="h-3.5 w-3.5" /> Skills</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {blueprint.skills.length === 0 ? "—" : blueprint.skills.map((s) => (
                  <span key={s} className="rounded-full border border-[var(--rule)] px-2 py-0.5 text-xs">{s}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[var(--ink-muted)]"><Wrench className="h-3.5 w-3.5" /> Tools</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {blueprint.tools.length === 0 ? "—" : blueprint.tools.map((t) => (
                  <span key={t} className="rounded-full border border-[var(--rule)] px-2 py-0.5 font-mono text-xs">{t}</span>
                ))}
              </dd>
            </div>
          </dl>

          {error && <p className="mt-4 text-sm text-[var(--flag)]">{error}</p>}

          <button
            onClick={create}
            disabled={!ready || creating}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--canvas)] disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ready ? "Create agent" : "Keep describing to finish"}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--ink-muted)]">
            You can fine-tune everything in the editor after creating.
          </p>
        </div>
      </div>
    </div>
  );
}
