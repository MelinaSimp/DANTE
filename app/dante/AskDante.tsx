"use client";

// app/dante/AskDante.tsx
//
// Harvey-style chat surface for /dante. Two modes:
//
//   Landing (no messages yet):
//     - Big "D" wordmark
//     - Optional contact-context chip
//     - Centered input with toolbar
//     - Knowledge source pills
//     - Recent chats collapsible
//
//   Expanded (after first ask):
//     - Wordmark + pills fade out
//     - User+assistant messages stack vertically with no chat bubbles,
//       just clean prose like Harvey
//     - Each assistant message has an action bar (Copy / Export /
//       Rewrite / Open in editor / thumbs-up / thumbs-down), a Sources block, and
//       suggested follow-ups
//     - Input pins to the bottom for follow-up turns
//
// State is local — refreshing the page returns to the landing.
// Persistent threads live at /dante/chat/[id]; the History collapsible
// links there.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Library,
  Sliders,
  Telescope,
  Database,
  BookOpen,
  Users,
  CalendarDays,
  Workflow,
  History,
  X,
  Search,
  Globe,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { deriveFilenameStem } from "./DocumentPanel";
import DraftEditor from "@/components/dante/DraftEditor";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import {
  consumeAgentStream,
  type StreamState,
  initialStreamState,
} from "./streamClient";
import {
  UserMessage,
  AssistantMessage,
  LiveThinking,
} from "./MessageView";

// ── Types ────────────────────────────────────────────────────────

interface RecentChat {
  id: string;
  title: string;
  updated_at: string;
}

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
}

interface AssistantTurn {
  role: "assistant";
  content: string;
  trace: unknown;
  followups: string[];
  /** Captured from streamState.citationReport at turn finalization. */
  citationReport?: import("./streamClient").CitationReportState | null;
  grounding?: import("./streamClient").GroundingState | null;
}

interface UserTurn {
  role: "user";
  content: string;
}

type Turn = UserTurn | AssistantTurn;

const QUICK_PROMPTS_ADVISOR: Array<{ label: string; prompt: string }> = [
  {
    label: "Brief me on a client",
    prompt:
      "Brief me on [client name] — pull recent context from memory and surface anything I previously promised them, recent concerns from email, and one personal detail to open with.",
  },
  {
    label: "Summarize recent emails",
    prompt:
      "Summarize the last 14 days of emails with [client name]. Focus on concerns raised, commitments either side made, and anything still open.",
  },
  {
    label: "Prep for a meeting",
    prompt:
      "I have a meeting with [client name] in 30 minutes. What should I know going in?",
  },
  {
    label: "Find at-risk clients",
    prompt:
      "Which clients have I not contacted in over 60 days? Pull the list and flag anyone with negative recent signal.",
  },
];

const QUICK_PROMPTS_REALTOR: Array<{ label: string; prompt: string }> = [
  {
    label: "Brief me on a tenant",
    prompt:
      "Brief me on [tenant / contact name] — pull recent context from memory, any lease dates coming up, and open issues or requests.",
  },
  {
    label: "Summarize a lease",
    prompt:
      "Summarize the key terms of the lease for [property / tenant]. Include rent, expiry, renewal options, and any unusual clauses.",
  },
  {
    label: "Prep for a showing",
    prompt:
      "I have a showing at [property address] in 30 minutes. What should I know — comps, zoning, recent inspection notes?",
  },
  {
    label: "Expiring leases this quarter",
    prompt:
      "Which leases expire in the next 90 days? Flag any tenants I haven't contacted yet about renewal.",
  },
];

// Quick-jump pills under the landing input. Each routes to its real
// page so the "Memory" / "Vault" / etc. labels aren't decorative —
// click them and you land on the workspace's archive, vault docs,
// contacts list, calendar, or workflows builder. Workflows added
// because the user uses it daily; without it the pill row was just
// a passive legend.
const KNOWLEDGE_SOURCES = [
  { label: "Memory", icon: Database, href: "/dante/archive" },
  { label: "Vault", icon: BookOpen, href: "/vault" },
  { label: "Contacts", icon: Users, href: "/client-details-overview" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { label: "Workflows", icon: Workflow, href: "/dante/workflows" },
] as const;

// Workflow tiles surfaced on the landing — the four highest-value
// templates curated for first-time-feel. Picked manually rather
// than slicing the full list from lib/dante/templates.ts because
// (a) the bundle size for the gallery's full registry is wasted on
// a 4-card preview and (b) the order matters for the buyer
// demographic — meeting prep + post-meeting + QBR + life event
// reads as the day-job of an advisor; the niche templates can wait
// for the /dante/workflows page proper.
const RECOMMENDED_WORKFLOWS_ADVISOR = [
  { slug: "meeting-prep-packet", name: "Draft a meeting prep packet", kindLabel: "Draft", steps: 5 },
  { slug: "post-meeting-followup", name: "Generate post-meeting follow-up", kindLabel: "Output", steps: 4 },
  { slug: "qbr-reminder", name: "Quarterly review reminders", kindLabel: "Output", steps: 4 },
  { slug: "life-event-detector", name: "Surface client life events", kindLabel: "Review", steps: 5 },
] as const;

const RECOMMENDED_WORKFLOWS_REALTOR = [
  { slug: "lease-expiration-outreach", name: "Lease expiration outreach", kindLabel: "Outreach", steps: 4 },
  { slug: "property-showing-prep", name: "Prep a property showing packet", kindLabel: "Draft", steps: 5 },
  { slug: "tenant-renewal-followup", name: "Tenant renewal follow-up", kindLabel: "Output", steps: 4 },
  { slug: "comp-analysis", name: "Run a comp analysis", kindLabel: "Research", steps: 3 },
] as const;

const REWRITE_PRESETS = [
  { label: "Shorter", instruction: "Make it shorter — half the length, same key facts." },
  { label: "Bullets", instruction: "Rewrite as a bulleted list." },
  { label: "More formal", instruction: "Rewrite in a more formal, client-facing tone." },
  { label: "Add example", instruction: "Add a concrete example illustrating the main point." },
] as const;

// ── Component ────────────────────────────────────────────────────

export default function AskDante({
  assistantName = "Dante",
}: {
  /** Brand name of the assistant — "Dante" for FA, "Vergil" for RE. */
  assistantName?: string;
}) {
  // Brand info (name + iconPath) flows from /dante/layout.tsx via the
  // AssistantNameProvider context. The prop above is a legacy override
  // — we keep it for the InputBar placeholder, but the hero icon
  // reads from context so it always matches the breadcrumb gate.
  const brand = useAssistantBrand();
  const isRealtor = brand.name === "Vergil";
  const QUICK_PROMPTS = isRealtor ? QUICK_PROMPTS_REALTOR : QUICK_PROMPTS_ADVISOR;
  const RECOMMENDED_WORKFLOWS = isRealtor ? RECOMMENDED_WORKFLOWS_REALTOR : RECOMMENDED_WORKFLOWS_ADVISOR;
  const router = useRouter();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState());
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  // Vergil-only — when true the composer routes to /api/dante/web-scrape
  // (Anthropic Web Scraper managed agent). Mutually exclusive with
  // deepResearch; the toolbar enforces that.
  const [webScrape, setWebScrape] = useState(false);
  const [refining, setRefining] = useState<"customize" | "rewrite" | null>(null);
  const [contextContact, setContextContact] = useState<Contact | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contextProject, setContextProject] = useState<{ id: string; name: string } | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [vaultProjects, setVaultProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  // Files attached via the + Files and sources button. Browser-side
  // text extraction lands here; the array gets shipped on the next
  // submit() in the existing `attachments` field. Cleared after send.
  const [attachments, setAttachments] = useState<Array<{
    name: string;
    ext?: string;
    text: string;
    truncated?: boolean;
  }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const inExpandedMode = turns.length > 0 || streamState.streaming;

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dante/chats");
      const json = await res.json();
      setRecent((json.chats || []) as RecentChat[]);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    refreshRecent();
    fetch("/api/vault/projects")
      .then((r) => r.json())
      .then((d) => setVaultProjects(d.projects || []))
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, [refreshRecent]);

  useEffect(() => {
    if (!projectPickerOpen) return;
    const handler = () => setProjectPickerOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [projectPickerOpen]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, streamState.streaming, streamState.events.length, streamState.followups.length]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  // Browser-side text extraction for the + Files and sources picker.
  // Three paths:
  //   • Plain text (txt/md/csv/json/log/yaml/yml/tsv) — TextDecoder
  //   • PDF — pdfjs-dist (already in the bundle for SourceViewer);
  //     walks pages, concatenates getTextContent items.
  //   • DOCX — mammoth (already in the bundle for SourceViewer);
  //     extractRawText returns the document's plain text.
  // Anything else gets a friendly placeholder so the model still
  // knows the user offered the file.
  const TEXT_EXTS = new Set(["txt", "md", "csv", "json", "log", "yaml", "yml", "tsv"]);
  const MAX_TEXT_CHARS = 200_000; // ~50k tokens — preserves prompt budget

  async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const pdfjs = (await import("pdfjs-dist")) as unknown as {
      GlobalWorkerOptions: { workerSrc?: string };
      getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
          cleanup: () => void;
        }>;
      }> };
    };
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const out: string[] = [];
    let total = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      if (total > MAX_TEXT_CHARS) break;
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((i) => i.str || "")
        .filter(Boolean)
        .join(" ");
      out.push(pageText);
      total += pageText.length;
      page.cleanup();
    }
    return out.join("\n\n");
  }

  async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
    const mod = (await import(
      /* webpackChunkName: "mammoth-browser" */
      "mammoth/mammoth.browser.js" as string
    )) as unknown as {
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    const { value } = await mod.extractRawText({ arrayBuffer: buffer });
    return value || "";
  }

  function clamp(text: string): { text: string; truncated: boolean } {
    if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
    return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }

  async function readFileForAttach(file: File): Promise<{
    name: string;
    ext?: string;
    text: string;
    truncated?: boolean;
  } | null> {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (TEXT_EXTS.has(ext)) {
        const buf = await file.arrayBuffer();
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
      if (ext === "pdf") {
        const buf = await file.arrayBuffer();
        const raw = await extractPdfText(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
      if (ext === "docx" || ext === "doc") {
        const buf = await file.arrayBuffer();
        const raw = await extractDocxText(buf);
        const { text, truncated } = clamp(raw);
        return { name: file.name, ext, text, truncated };
      }
    } catch (e) {
      console.warn(`[file-attach] extraction failed for ${file.name}:`, e);
      return {
        name: file.name,
        ext: ext || undefined,
        text: `(File ${file.name} couldn't be read: ${e instanceof Error ? e.message : "extraction failed"}. Try converting to text and re-attaching.)`,
        truncated: false,
      };
    }
    return {
      name: file.name,
      ext: ext || undefined,
      text: `(File ${file.name} attached — ${ext.toUpperCase() || "this file type"} not yet supported in chat. Drop it into a watched folder to ingest into the vault, or convert to text first.)`,
      truncated: false,
    };
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    if (files.length === 0) return;
    const extracted = await Promise.all(files.map(readFileForAttach));
    const fresh = extracted.filter((x): x is NonNullable<typeof x> => Boolean(x));
    setAttachments((prev) => [...prev, ...fresh]);
  }

  const submit = async (overrideInput?: string) => {
    const message = (overrideInput ?? input).trim();
    if (!message || streamState.streaming) return;

    abortRef.current = new AbortController();
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    // Snapshot attachments now; clear state so the next turn starts
    // with a fresh tray. The body below references this snapshot.
    const sentAttachments = attachments;
    setAttachments([]);
    setStreamState({ ...initialStreamState(), streaming: true });

    try {
      let captured: StreamState = initialStreamState();
      // Mode → endpoint routing. Three modes:
      //   • web-scrape (Vergil "Pull comps") → /api/dante/web-scrape
      //   • deep-research (Telescope toggle) → /api/dante/deep-research
      //   • default chat → /api/dante/ask
      // Each managed-agent endpoint speaks the same SSE protocol, so
      // the consumer doesn't change. Contact/property scope is dropped
      // for managed-agent runs since those agents have no Drift vault
      // access — they read the open web.
      const isManagedAgent = webScrape || deepResearch;
      const endpoint = webScrape
        ? "/api/dante/web-scrape"
        : deepResearch
          ? "/api/dante/deep-research"
          : "/api/dante/ask";
      await consumeAgentStream({
        endpoint,
        body: {
          message,
          deep: deepResearch,
          context_contact_id: isManagedAgent ? undefined : contextContact?.id,
          context_contact_name: isManagedAgent ? undefined : (contextContact?.name || undefined),
          context_project_id: contextProject?.id,
          attachments: sentAttachments.length > 0 ? sentAttachments : undefined,
        },
        signal: abortRef.current.signal,
        onUpdate: (next) => {
          captured = next;
          setStreamState(next);
        },
      });
      // Stream ended — flush the assistant turn into the persistent
      // turns list so subsequent renders show it like history. Reset
      // streamState so the live trace clears.
      const assistantTurn: AssistantTurn = {
        role: "assistant",
        content: captured.finalContent || "(no response)",
        trace: captured.trace,
        followups: captured.followups || [],
        citationReport: captured.citationReport ?? null,
        grounding: captured.grounding ?? null,
      };
      setTurns((prev) => [...prev, assistantTurn]);
      setStreamState(initialStreamState());
      refreshRecent();
    } catch (err) {
      setStreamState((prev) => ({
        ...prev,
        streaming: false,
        error: err instanceof Error ? err.message : "request_failed",
      }));
    }
  };

  const onCustomize = async () => {
    const text = input.trim();
    if (!text || refining) return;
    setRefining("customize");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "prompt", text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`Customize failed (${res.status}): ${body.slice(0, 200)}`);
        return;
      }
      const json = await res.json();
      if (json.text) {
        setInput(json.text);
        textareaRef.current?.focus();
      }
    } catch (err) {
      alert(`Customize failed: ${err instanceof Error ? err.message : "network error"}`);
    } finally {
      setRefining(null);
    }
  };

  const onRewriteLast = async (instruction: string) => {
    // Rewrites the latest assistant turn's content per the chosen
    // preset. Citations are preserved verbatim by the refine endpoint.
    const lastIdx = [...turns].reverse().findIndex((t) => t.role === "assistant");
    if (lastIdx < 0 || refining) return;
    const realIdx = turns.length - 1 - lastIdx;
    const assistant = turns[realIdx] as AssistantTurn;
    setRefining("rewrite");
    try {
      const res = await fetch("/api/dante/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "answer", text: assistant.content, instruction }),
      });
      const json = await res.json();
      if (res.ok && json.text) {
        setTurns((prev) => {
          const next = [...prev];
          next[realIdx] = { ...assistant, content: json.text };
          return next;
        });
      }
    } catch {
      /* swallow */
    } finally {
      setRefining(null);
    }
  };

  const usePrompt = (prompt: string) => {
    setInput(prompt);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const useFollowup = (q: string) => {
    submit(q);
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full w-full ${inExpandedMode ? "" : "px-6"}`}>
      {/* Landing — Mike-style centered greeting with serif font */}
      <div
        className={`transition-all duration-500 ease-out ${
          inExpandedMode
            ? "opacity-0 -translate-y-4 max-h-0 overflow-hidden pointer-events-none"
            : "flex-1 flex flex-col items-center justify-center px-6"
        }`}
      >
        <div className="flex-col items-center w-full max-w-4xl relative px-0 xl:px-8">
          <div className="mb-10 text-center">
            <h1 className="text-4xl font-serif font-light text-gray-900">
              Hi, how can {brand.name} help?
            </h1>
          </div>

          {/* Scope chips — thin affordance row */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {contextProject ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-gray-100 rounded-full px-3 py-1">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                {contextProject.name}
                <button
                  onClick={() => setContextProject(null)}
                  className="hover:text-gray-900 ml-0.5"
                  title="Clear project scope"
                >
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </span>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProjectPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition"
                >
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Choose Vault project
                </button>
                {projectPickerOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-50 w-64 max-h-60 overflow-y-auto">
                    {vaultProjects.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No projects yet</div>
                    ) : (
                      vaultProjects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setContextProject(p);
                            setProjectPickerOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-md truncate"
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {contextContact ? (
              <ContextChip
                contact={contextContact}
                onClear={() => setContextContact(null)}
              />
            ) : (
              <button
                onClick={() => setContactPickerOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition"
              >
                <Users className="w-3.5 h-3.5" strokeWidth={1.5} />
                Set client context
              </button>
            )}
          </div>

          {/* Input — only inline (in landing) before any messages exist. */}
          {!inExpandedMode && (
            <>
              <InputBar
                input={input}
                setInput={setInput}
                onKeyDown={onKeyDown}
                submit={() => submit()}
                streaming={streamState.streaming}
                deepResearch={deepResearch}
                setDeepResearch={setDeepResearch}
                webScrape={webScrape}
                setWebScrape={setWebScrape}
                promptsOpen={promptsOpen}
                setPromptsOpen={setPromptsOpen}
                onCustomize={onCustomize}
                customizing={refining === "customize"}
                textareaRef={textareaRef}
                rows={3}
                assistantName={assistantName}
                onOpenFilesAndSources={() => fileInputRef.current?.click()}
                attachments={attachments}
                onRemoveAttachment={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                quickPrompts={QUICK_PROMPTS}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={onFilesPicked}
                accept=".txt,.md,.csv,.json,.log,.yaml,.yml,.tsv,.pdf,.docx,.doc"
              />
              <div className="text-center">
                <p className="text-xs py-3 text-gray-500">
                  AI can make mistakes. Answers are not legal or financial advice.
                </p>
              </div>

              {/* Knowledge source pills */}
              <div className="flex items-center justify-center gap-2 flex-wrap mt-2 mb-6">
                {KNOWLEDGE_SOURCES.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-500 hover:text-gray-800 hover:border-gray-300 transition"
                  >
                    <s.icon className="w-3 h-3" strokeWidth={1.5} />
                    {s.label}
                  </Link>
                ))}
              </div>

              {/* Recommended workflows */}
              <div className="w-full max-w-2xl mx-auto mb-6">
                <div className="grid grid-cols-2 gap-3">
                  {RECOMMENDED_WORKFLOWS.map((w) => (
                    <Link
                      key={w.slug}
                      href={`/dante/workflows?run=${w.slug}`}
                      className="group flex flex-col gap-1 rounded-lg border border-gray-200 p-3 hover:border-gray-300 hover:shadow-sm transition"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                        {w.kindLabel} · {w.steps} steps
                      </span>
                      <span className="text-sm text-gray-800 group-hover:text-gray-900 transition leading-snug">
                        {w.name}
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="text-center mt-3">
                  <Link
                    href="/dante/workflows"
                    className="text-xs text-gray-400 hover:text-gray-700 transition inline-flex items-center gap-1"
                  >
                    All workflows <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                  </Link>
                </div>
              </div>

              {/* Recent chats */}
              {recent.length > 0 && (
                <div className="w-full max-w-2xl mx-auto mb-4">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition mb-2"
                  >
                    <History className="w-3 h-3" strokeWidth={1.5} />
                    Recent conversations
                    {historyOpen ? (
                      <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                    )}
                  </button>
                  {historyOpen && (
                    <div className="space-y-0.5">
                      {recent.slice(0, 8).map((c) => (
                        <Link
                          key={c.id}
                          href={`/dante/chat/${c.id}`}
                          className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition"
                        >
                          <span className="truncate flex-1">{c.title}</span>
                          <span className="text-[10px] text-gray-400 ml-4 shrink-0">
                            {new Date(c.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scrollable messages area — flex-1 so it fills remaining height and scrolls from top */}
      {inExpandedMode && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Compact context chips */}
          {(contextContact || contextProject) && (
            <div className="mb-4 flex items-center gap-4 text-xs text-gray-500 max-w-4xl mx-auto px-6 md:px-8 pt-4">
              {contextProject && (
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" strokeWidth={1.5} />
                  <span className="text-gray-900 font-medium">{contextProject.name}</span>
                  <button onClick={() => setContextProject(null)} className="hover:text-gray-700" title="Clear project scope">
                    <X className="w-3 h-3" strokeWidth={2} />
                  </button>
                </span>
              )}
              {contextContact && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" strokeWidth={1.5} />
                  <span className="text-gray-900 font-medium">
                    {contextContact.name || contextContact.email}
                  </span>
                  <button onClick={() => setContextContact(null)} className="hover:text-gray-700" title="Clear context">
                    <X className="w-3 h-3" strokeWidth={2} />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Threaded messages */}
          <div className="max-w-4xl mx-auto px-6 md:px-8 pt-4 md:pt-6 pb-32 space-y-6">
            {turns.map((t, i) =>
              t.role === "user" ? (
                <UserMessage key={i} content={t.content} />
              ) : (
                <AssistantMessage
                  key={i}
                  content={t.content}
                  trace={t.trace}
                  followups={t.followups}
                  citationReport={t.citationReport ?? null}
                  grounding={t.grounding ?? null}
                  onOpenEditor={(c) => setEditorContent(c)}
                  onRewrite={(instruction) => onRewriteLast(instruction)}
                  onFollowup={(q) => useFollowup(q)}
                  rewriting={refining === "rewrite"}
                />
              ),
            )}

            {streamState.streaming && (
              <LiveThinking state={streamState} deep={deepResearch} />
            )}

            {streamState.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {streamState.error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Pinned input bar in expanded mode */}
      {inExpandedMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 pb-4 z-30">
          <div className="max-w-4xl mx-auto px-6 md:px-8">
            <InputBar
              compact
              input={input}
              setInput={setInput}
              onKeyDown={onKeyDown}
              submit={() => submit()}
              streaming={streamState.streaming}
              deepResearch={deepResearch}
              setDeepResearch={setDeepResearch}
              webScrape={webScrape}
              setWebScrape={setWebScrape}
              promptsOpen={promptsOpen}
              setPromptsOpen={setPromptsOpen}
              onCustomize={onCustomize}
              customizing={refining === "customize"}
              textareaRef={textareaRef}
              rows={2}
              assistantName={assistantName}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {contactPickerOpen && (
        <ContactPicker
          onPick={(c) => {
            setContextContact(c);
            setContactPickerOpen(false);
          }}
          onClose={() => setContactPickerOpen(false)}
        />
      )}
      {editorContent != null && (
        <DraftEditor
          initialContent={editorContent}
          filenameStem={deriveFilenameStem(editorContent)}
          onClose={() => setEditorContent(null)}
        />
      )}
    </div>
  );
}

// ── Input bar ───────────────────────────────────────────────────

interface InputBarProps {
  input: string;
  setInput: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  submit: () => void;
  streaming: boolean;
  deepResearch: boolean;
  setDeepResearch: (v: boolean | ((prev: boolean) => boolean)) => void;
  webScrape: boolean;
  setWebScrape: (v: boolean | ((prev: boolean) => boolean)) => void;
  promptsOpen: boolean;
  setPromptsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onCustomize: () => void;
  customizing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  rows: number;
  /** Brand name of the assistant, used in the placeholder. */
  assistantName: string;
  /** Optional handler for the Harvey-style "+ Files and sources"
   *  toolbar button. When omitted, the button is hidden. */
  onOpenFilesAndSources?: () => void;
  /** Files the user has attached for the next message — rendered
   *  as small chips above the textarea. Empty array hides the row. */
  attachments?: Array<{ name: string; ext?: string; truncated?: boolean }>;
  /** Remove the attachment at the given index. */
  onRemoveAttachment?: (idx: number) => void;
  /** When true, the toolbar (Prompts/Customize/Deep research) is
   *  hidden and the input shrinks to just textarea + send. Used in
   *  expanded mode where the chat is the focus and toolbar choices
   *  feel like noise. */
  compact?: boolean;
  quickPrompts?: Array<{ label: string; prompt: string }>;
}

function InputBar(p: InputBarProps) {
  // Compact mode — clean bordered input for expanded chat
  if (p.compact) {
    return (
      <div className="border border-gray-300 rounded-[16px] md:rounded-[20px] bg-white relative">
        <div className="px-4 pt-4">
          <textarea
            ref={p.textareaRef}
            value={p.input}
            onChange={(e) => p.setInput(e.target.value)}
            onKeyDown={p.onKeyDown}
            placeholder={`Ask ${p.assistantName} anything…`}
            disabled={p.streaming}
            rows={p.rows}
            className="w-full resize-none text-sm overflow-hidden border-0 p-0 bg-transparent outline-none placeholder:text-gray-400 leading-6 max-h-48"
          />
        </div>
        <div className="flex items-center justify-end p-2.5">
          <button
            onClick={p.submit}
            disabled={!p.input.trim() || p.streaming}
            className="relative bg-gradient-to-b from-neutral-700 to-black text-white rounded-[10px] h-8 w-8 flex items-center justify-center disabled:from-neutral-600 disabled:to-black disabled:opacity-40 backdrop-blur-xl border border-white/30 active:enabled:scale-95 transition-all duration-150"
            title="Send (Cmd+Enter)"
          >
            {p.streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Full landing input — Mike's rounded bordered style
  return (
    <div className="border border-gray-300 rounded-[16px] md:rounded-[20px] bg-white">
      {/* Attachment chips */}
      {p.attachments && p.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {p.attachments.map((a, i) => (
            <span
              key={`${a.name}-${i}`}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white shadow border border-white/20 bg-black"
              title={a.truncated ? `${a.name} (truncated to fit)` : a.name}
            >
              <span className="max-w-[140px] truncate">{a.name}</span>
              {p.onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => p.onRemoveAttachment?.(i)}
                  className="rounded-full p-0.5 ml-0.5 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="px-4 pt-4">
        <textarea
          ref={p.textareaRef}
          value={p.input}
          onChange={(e) => p.setInput(e.target.value)}
          onKeyDown={p.onKeyDown}
          placeholder={`Ask ${p.assistantName} anything…`}
          disabled={p.streaming}
          rows={p.rows}
          className="w-full resize-none text-sm overflow-hidden border-0 p-0 bg-transparent outline-none placeholder:text-gray-400 leading-6 max-h-48"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between md:p-2.5 p-2">
        <div className="flex items-center gap-1">
          {p.onOpenFilesAndSources && (
            <button
              onClick={p.onOpenFilesAndSources}
              disabled={p.streaming}
              className="flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Files</span>
            </button>
          )}
          <ToolbarButton
            icon={Library}
            label="Prompts"
            active={p.promptsOpen}
            onClick={() => p.setPromptsOpen((v) => !v)}
          />
          <ToolbarButton
            icon={Telescope}
            label="Deep research"
            active={p.deepResearch}
            onClick={() => {
              p.setDeepResearch((v) => {
                const next = !v;
                if (next) p.setWebScrape(false);
                return next;
              });
            }}
          />
          <ToolbarButton
            icon={Globe}
            label="Web scrape"
            active={p.webScrape}
            onClick={() => {
              p.setWebScrape((v) => {
                const next = !v;
                if (next) p.setDeepResearch(false);
                return next;
              });
            }}
          />
        </div>

        <button
          onClick={p.submit}
          disabled={!p.input.trim() || p.streaming}
          className="relative bg-gradient-to-b from-neutral-700 to-black text-white rounded-[10px] h-8 w-8 flex items-center justify-center disabled:from-neutral-600 disabled:to-black disabled:opacity-40 backdrop-blur-xl border border-white/30 active:enabled:scale-95 transition-all duration-150"
          title="Send (Cmd+Enter)"
        >
          {p.streaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" strokeWidth={2} />
          )}
        </button>
      </div>

      {p.promptsOpen && (
        <div className="border-t border-gray-200 px-3 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
            Quick prompts
          </div>
          <div className="space-y-1">
            {(p.quickPrompts || QUICK_PROMPTS_ADVISOR).map((q) => (
              <button
                key={q.label}
                onClick={() => {
                  p.setInput(q.prompt);
                  p.setPromptsOpen(false);
                  p.textareaRef.current?.focus();
                }}
                className="block w-full text-left rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ──────────────────────────────────────────────

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  loading,
  tip,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tip?: string;
  onClick?: () => void;
}) {
  const palette = active
    ? "text-blue-600 hover:bg-blue-50"
    : disabled
      ? "text-gray-300"
      : "text-gray-400 hover:bg-gray-100 hover:text-gray-700";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={tip}
      className={`flex items-center gap-1.5 rounded-lg px-2 h-8 text-sm transition-colors disabled:cursor-not-allowed ${palette}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
      {label}
    </button>
  );
}

// ── Context chip (landing) ──────────────────────────────────────

function ContextChip({
  contact,
  onClear,
}: {
  contact: Contact;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1 text-xs text-white">
      <Users className="w-3 h-3" strokeWidth={1.5} />
      {contact.name || contact.email || "Unnamed"}
      <button onClick={onClear} className="ml-0.5 hover:opacity-70" title="Clear context">
        <X className="w-3 h-3" strokeWidth={2} />
      </button>
    </span>
  );
}

// ── Contact picker modal ────────────────────────────────────────

function ContactPicker({
  onPick,
  onClose,
}: {
  onPick: (c: Contact) => void;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setContacts(data as Contact[]);
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => `${c.name || ""} ${c.email || ""}`.toLowerCase().includes(q))
    : contacts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" />
              Loading contacts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              No matching contacts.
            </div>
          ) : (
            filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                className="block w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <div className="font-medium">{c.name || "(unnamed)"}</div>
                {c.email && (
                  <div className="text-[11px] text-gray-500">{c.email}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
