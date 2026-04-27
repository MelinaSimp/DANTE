"use client";

// AgentConfigClient — the editor for a single agent's persona and
// knowledge base. Three sections:
//
//   1. Identity   — name + short description. Used as the agent's
//                   self-reference when there's no custom instructions.
//   2. Persona    — llm_instructions. Free text. This is where the
//                   company name + what-you-do lives; the voice agent
//                   uses this verbatim as its system prompt at call
//                   time. A template helper sits above the textarea
//                   for people staring at a blank box.
//   3. Knowledge  — agent_data_sources rows. Paste text or upload
//                   files; the agent can quote from these on the
//                   call. Only text with actual content is stitched
//                   into the VAPI prompt, so the user knows whether
//                   an entry will actually be used.
//
// When the agent is deployed with the VAPI voice provider, any save
// on identity/persona auto-triggers a VAPI resync so the change is
// live on the next call. A small status strip confirms it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  Database,
  Upload,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  GitBranch,
  Mic,
} from "lucide-react";
import ScenarioBuilder, { type Scenario } from "./ScenarioBuilder";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  llm_instructions: string | null;
  first_message: string | null;
  modality: string | null;
  status: string | null;
  voice_provider: string | null;
  vapi_assistant_id: string | null;
  elevenlabs_voice_id: string | null;
  phone_number: string | null;
  llm_model: string | null;
  mode?: "llm" | "scenario" | null;
  scenario?: any;
}

const MODEL_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Fastest, cheapest. Recommended for most calls." },
  { id: "gpt-4o", label: "GPT-4o", hint: "Smartest OpenAI model. Slower and ~10× the per-minute cost." },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Legacy. Use only if you've tuned a prompt against it." },
];

interface Voice {
  voice_id: string;
  name: string;
}

interface DataSource {
  id: string;
  name: string;
  type: "file" | "text" | "api_key";
  content: string | null;
  file_url: string | null;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

const PERSONA_TEMPLATE = `You are the AI receptionist for {{Company Name}}, a {{one-line description of what you do}}.

Your job is to:
- Greet callers warmly and ask how you can help.
- Answer questions about our services using only the knowledge base below — if you don't know, say so and offer to take a message.
- Schedule appointments when callers request one (use the scheduling tool).
- Never claim to be a human. Never invent products, prices, or hours.

Tone: concise, friendly, one or two short sentences at a time. Speak naturally for voice.

If asked about anything outside our business, politely redirect.`;

export default function AgentConfigClient({
  agent,
  initialDataSources,
}: {
  agent: Agent;
  initialDataSources: DataSource[];
}) {
  // Identity + persona state
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [instructions, setInstructions] = useState(agent.llm_instructions ?? "");
  const [firstMessage, setFirstMessage] = useState(agent.first_message ?? "");
  const [voiceId, setVoiceId] = useState(agent.elevenlabs_voice_id ?? "");
  const [llmModel, setLlmModel] = useState(agent.llm_model ?? "gpt-4o-mini");
  const [mode, setMode] = useState<"llm" | "scenario">(agent.mode === "scenario" ? "scenario" : "llm");
  const [scenario, setScenario] = useState<Scenario>(
    agent.scenario && typeof agent.scenario === "object"
      ? (agent.scenario as Scenario)
      : { version: 1, entry: null, nodes: [] }
  );
  const [savingAgent, setSavingAgent] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Voice list — fetched once on mount. If the endpoint fails (no API
  // key, network), we fall back to a free-text voice ID field so the
  // feature still works.
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/elevenlabs/voices", { credentials: "include" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setVoicesError(j?.error || "Couldn't load voice list");
          setVoices([]);
          return;
        }
        setVoices((j?.voices as Voice[]) || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setVoicesError(e?.message || "Couldn't load voice list");
          setVoices([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Knowledge base state
  const [dataSources, setDataSources] = useState<DataSource[]>(initialDataSources);
  const [textDraft, setTextDraft] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const dirty =
    name !== agent.name ||
    description !== (agent.description ?? "") ||
    instructions !== (agent.llm_instructions ?? "") ||
    firstMessage !== (agent.first_message ?? "") ||
    voiceId !== (agent.elevenlabs_voice_id ?? "") ||
    llmModel !== (agent.llm_model ?? "gpt-4o-mini") ||
    mode !== (agent.mode === "scenario" ? "scenario" : "llm") ||
    JSON.stringify(scenario) !==
      JSON.stringify(agent.scenario ?? { version: 1, entry: null, nodes: [] });

  const isDeployedVapi =
    agent.status === "deployed" && agent.voice_provider === "vapi";

  // Poll data sources every 5s only while there's a PDF still
  // waiting on extraction (content === null on a file row). This
  // avoids hammering the API once everything's settled.
  useEffect(() => {
    const pendingPdf = dataSources.some(
      (d) =>
        d.type === "file" &&
        !d.content &&
        (d.file_type === "application/pdf" ||
          d.name.toLowerCase().endsWith(".pdf"))
    );
    if (!pendingPdf) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/agents/${agent.id}/data-sources`);
        if (!r.ok || cancelled) return;
        const fresh = await r.json();
        if (!cancelled) setDataSources(fresh);
      } catch {}
    };
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dataSources, agent.id]);

  const saveAgent = useCallback(async () => {
    setSavingAgent(true);
    setSyncError(null);
    try {
      const r = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim() || agent.name,
          description: description.trim() || null,
          llm_instructions: instructions.trim() || null,
          first_message: firstMessage.trim() || null,
          elevenlabs_voice_id: voiceId.trim() || null,
          llm_model: llmModel || "gpt-4o-mini",
          mode,
          scenario: mode === "scenario" ? scenario : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Save failed");
      setSavedAt(Date.now());

      // Auto-resync to VAPI if deployed, so the persona change is live
      // on the next call without requiring a pause/deploy toggle.
      if (isDeployedVapi) {
        setSyncState("syncing");
        try {
          const sr = await fetch(`/api/agents/${agent.id}/vapi-sync`, {
            method: "POST",
            credentials: "include",
          });
          if (!sr.ok) {
            const { error } = await sr.json().catch(() => ({ error: "" }));
            throw new Error(error || "Resync failed");
          }
          setSyncState("synced");
          setTimeout(() => setSyncState("idle"), 4000);
        } catch (e: any) {
          setSyncState("error");
          setSyncError(e.message || "Resync failed");
        }
      }
    } catch (e: any) {
      setSyncState("error");
      setSyncError(e.message || "Save failed");
    } finally {
      setSavingAgent(false);
    }
  }, [agent.id, agent.name, description, instructions, firstMessage, voiceId, llmModel, mode, scenario, isDeployedVapi, name]);

  const addText = async () => {
    if (!textDraft.trim()) return;
    setAddingText(true);
    try {
      const r = await fetch(`/api/agents/${agent.id}/data-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: `Text note — ${new Date().toLocaleDateString()}`,
          type: "text",
          content: textDraft.trim(),
        }),
      });
      if (r.ok) {
        const created = await r.json();
        setDataSources((prev) => [created, ...prev]);
        setTextDraft("");
      }
    } finally {
      setAddingText(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("agentId", agent.id);
        form.append("category", "data-sources");

        const up = await fetch("/api/upload", { method: "POST", body: form });
        if (!up.ok) {
          const { error } = await up.json().catch(() => ({ error: "" }));
          throw new Error(error || `Upload failed: ${file.name}`);
        }
        const u = await up.json();

        const r = await fetch(`/api/agents/${agent.id}/data-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: file.name,
            type: "file",
            file_url: u.url,
            file_size: u.fileSize,
            file_type: u.fileType,
          }),
        });
        if (r.ok) {
          const created = await r.json();
          setDataSources((prev) => [created, ...prev]);
        }
      }
    } catch (e: any) {
      setUploadError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeSource = async (id: string) => {
    if (!confirm("Delete this knowledge entry? The agent won't see it on future calls.")) return;
    const prev = dataSources;
    setDataSources((p) => p.filter((d) => d.id !== id));
    const r = await fetch(`/api/agents/${agent.id}/data-sources/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) setDataSources(prev); // rollback on failure
  };

  const insertTemplate = () => {
    if (instructions.trim()) {
      if (!confirm("This will overwrite your current persona text. Continue?")) return;
    }
    setInstructions(PERSONA_TEMPLATE);
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
            <Link
              href="/dashboard"
              className="hover:text-[var(--ink)] transition"
            >
              Drift
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <Link href="/agent" className="hover:text-[var(--ink)] transition">
              Agents
            </Link>
            <span className="text-[var(--ink-subtle)]">/</span>
            <span className="text-[var(--ink)]">{agent.name}</span>
          </div>
          <Link
            href="/agent"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Agents
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-10">
        {/* Page header */}
        <div>
          <div className="label-section mb-2">Agent configuration</div>
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-2">
            {agent.name}
          </h1>
          <p className="text-sm text-[var(--ink-muted)] max-w-2xl">
            Set who this agent is, what your company does, and the knowledge
            it's allowed to quote from on calls.
            {isDeployedVapi ? (
              <>
                {" "}Changes you save below go live on the next call — no
                redeploy needed.
              </>
            ) : null}
          </p>
        </div>

        {/* Identity */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <div className="label-section mb-1">Identity</div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                Who the agent is
              </h2>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                Agent name
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                placeholder="e.g. Riley"
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
                Short description
              </div>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
                placeholder="Receptionist for Acme Wealth"
              />
            </label>
          </div>
          <p className="text-[11px] text-[var(--ink-subtle)] mt-3">
            Used as a fallback self-reference when the persona below is empty.
          </p>
        </section>

        {/* Mode picker — LLM (free-form) vs Scenario (deterministic). */}
        <section className="card-flat p-6">
          <div className="mb-4">
            <div className="label-section mb-1">Mode</div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              How the agent decides what to say
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
              Pick LLM for free-form persona-driven calls, or Scenario for a
              deterministic if/then script with hard branches and transfers.
              Voicemail and transfer are first-class steps in scenario mode.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {(["llm", "scenario"] as const).map((m) => {
              const Icon = m === "llm" ? Mic : GitBranch;
              const selected = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="text-left transition"
                  style={{
                    border: selected
                      ? "1px solid var(--ink)"
                      : "1px solid var(--rule)",
                    background: selected
                      ? "var(--canvas-subtle)"
                      : "var(--canvas)",
                    color: "var(--ink)",
                    borderRadius: "var(--r-input)",
                    padding: "14px 16px",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                    <span className="text-sm font-semibold">
                      {m === "llm" ? "LLM" : "Scenario"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {m === "llm"
                      ? "Persona prompt drives the conversation. Best for open-ended Q&A and reception."
                      : "Step-by-step script. Best for tightly controlled flows like screening, qualification, after-hours routing."}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Persona / instructions — only when mode === 'llm'. */}
        {mode === "llm" && (
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-5 gap-4 flex-wrap">
            <div>
              <div className="label-section mb-1">Persona &amp; rules</div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                What to say and how to act
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
                This becomes the system prompt the voice agent reads on every
                call. Put your company name, what you do, tone, and any hard
                rules here.
              </p>
            </div>
            <button
              onClick={insertTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              Insert template
            </button>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={PERSONA_TEMPLATE}
            className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] resize-y font-mono leading-relaxed"
          />
          <p className="text-[11px] text-[var(--ink-subtle)] mt-2">
            Tip: reference your company by its real name. The agent will say it
            verbatim — if you leave an old name in here, callers will hear it.
          </p>
        </section>
        )}

        {/* Scenario builder — only when mode === 'scenario'. */}
        {mode === "scenario" && (
        <section className="card-flat p-6">
          <div className="mb-5">
            <div className="label-section mb-1">Scenario</div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Step-by-step call script
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
              Build the call flow as a sequence of steps. Branches let you
              route based on what the caller says; voicemail and transfer
              are terminal. The agent follows this verbatim — the persona
              text above is ignored when scenario mode is on.
            </p>
          </div>
          <ScenarioBuilder value={scenario} onChange={setScenario} />
        </section>
        )}

        {/* First message */}
        <section className="card-flat p-6">
          <div className="mb-4">
            <div className="label-section mb-1">Opening line</div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              What the caller hears first
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
              Spoken verbatim as soon as the call connects. Leave blank to use
              the default greeting (<span className="mono">Hello! This is {agent.name}. How can I help you today?</span>).
            </p>
          </div>
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            rows={2}
            placeholder={`Hi, this is ${agent.name} at Acme Wealth. How can I help?`}
            className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
          />
        </section>

        {/* Voice */}
        <section className="card-flat p-6">
          <div className="mb-4">
            <div className="label-section mb-1">Voice</div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              How the agent sounds
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
              Pick from your ElevenLabs voices. Change it here and the next
              call uses the new voice — no redeploy needed.
            </p>
          </div>
          {voices === null ? (
            <div className="inline-flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              Loading voices…
            </div>
          ) : voices.length === 0 ? (
            <div className="space-y-3">
              {voicesError && (
                <div className="inline-flex items-start gap-2 text-xs text-[var(--danger)]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
                  <span>{voicesError}</span>
                </div>
              )}
              <input
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="ElevenLabs voice ID (e.g. 21m00Tcm4TlvDq8ikWAM)"
                className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] mono"
              />
              <p className="text-[11px] text-[var(--ink-subtle)]">
                Voice list couldn't load — paste the voice ID directly. You
                can find it in your ElevenLabs dashboard.
              </p>
            </div>
          ) : (
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--rule-strong)]"
            >
              <option value="">— Use VAPI default voice —</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* Model */}
        <section className="card-flat p-6">
          <div className="mb-4">
            <div className="label-section mb-1">Model</div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Which LLM powers the conversation
            </h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
              The smarter models reason better about edge cases but cost more
              per minute and can feel slower on the line. Default is fine for
              most workflows.
            </p>
          </div>
          <div className="grid gap-2">
            {MODEL_OPTIONS.map((m) => {
              const selected = llmModel === m.id;
              return (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 cursor-pointer rounded-[4px] border p-3 transition ${
                    selected
                      ? "border-[var(--ink)] bg-[var(--canvas-subtle)]"
                      : "border-[var(--rule)] hover:border-[var(--rule-strong)] bg-[var(--canvas)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="llm-model"
                    value={m.id}
                    checked={selected}
                    onChange={() => setLlmModel(m.id)}
                    className="mt-0.5 accent-[var(--ink)]"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)] mono">{m.label}</div>
                    <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">{m.hint}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Save strip */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={saveAgent}
            disabled={!dirty || savingAgent}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[4px] bg-[var(--ink)] hover:opacity-90 text-[var(--canvas)] text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingAgent ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="w-4 h-4" strokeWidth={1.5} />
            )}
            {savingAgent ? "Saving..." : "Save changes"}
          </button>

          {savedAt && !savingAgent && syncState !== "syncing" && syncState !== "error" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--verified)]">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Saved
            </span>
          )}
          {syncState === "syncing" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
              Pushing to voice provider…
            </span>
          )}
          {syncState === "synced" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--verified)]">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Live on next call
            </span>
          )}
          {syncState === "error" && syncError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--danger)]">
              <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              {syncError}
            </span>
          )}
          {!isDeployedVapi && (
            <span className="text-[11px] text-[var(--ink-subtle)]">
              Agent is {agent.status === "deployed" ? "deployed (custom provider)" : "draft"}. Deploy with VAPI to push persona changes live automatically.
            </span>
          )}
        </div>

        {/* Knowledge base */}
        <section className="card-flat p-6">
          <div className="flex items-baseline justify-between mb-5 gap-4 flex-wrap">
            <div>
              <div className="label-section mb-1">Knowledge base</div>
              <h2 className="text-base font-semibold text-[var(--ink)]">
                What the agent can quote
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xl">
                Paste text or upload PDFs. The agent uses these to answer
                factual questions. Only entries with actual content reach the
                call — PDFs are processed in the background.
              </p>
            </div>
          </div>

          {/* Add text */}
          <div className="mb-5">
            <div className="text-xs font-medium text-[var(--ink-muted)] mb-1.5">
              Paste text
            </div>
            <textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              rows={3}
              placeholder="e.g. Our hours are Mon–Fri 9am–5pm Central. We charge a 1% AUM fee with no minimum."
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:outline-none focus:border-[var(--rule-strong)] resize-y"
            />
            <div className="mt-2">
              <button
                onClick={addText}
                disabled={!textDraft.trim() || addingText}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[4px] border border-[var(--rule)] bg-[var(--canvas)] hover:bg-[var(--canvas-subtle)] text-xs font-medium text-[var(--ink)] transition disabled:opacity-40"
              >
                {addingText ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                Add text entry
              </button>
            </div>
          </div>

          {/* Upload zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              await uploadFiles(Array.from(e.dataTransfer.files));
            }}
            className={`rounded-[6px] border border-dashed p-8 text-center transition ${
              dragOver
                ? "border-[var(--ink)] bg-[var(--canvas-subtle)]"
                : "border-[var(--rule-strong)] bg-[var(--canvas)]"
            }`}
          >
            <input
              id="agent-kb-upload"
              type="file"
              multiple
              accept=".pdf,application/pdf,.txt,.md,.doc,.docx,text/*"
              onChange={async (e) => {
                if (!e.target.files) return;
                await uploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
              className="hidden"
            />
            <label htmlFor="agent-kb-upload" className="cursor-pointer block">
              <Upload
                className="w-6 h-6 text-[var(--ink-muted)] mx-auto mb-2"
                strokeWidth={1.5}
              />
              <div className="text-sm text-[var(--ink)] font-medium">
                {uploading ? "Uploading…" : "Drop files or click to upload"}
              </div>
              <div className="text-[11px] text-[var(--ink-subtle)] mt-1">
                PDFs, text, markdown. PDFs are text-extracted automatically.
              </div>
            </label>
          </div>
          {uploadError && (
            <div className="mt-3 flex items-start gap-2 text-xs text-[var(--danger)]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Source list */}
          {dataSources.length > 0 && (
            <ul className="mt-6 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {dataSources.map((d) => {
                const isPdf =
                  d.type === "file" &&
                  (d.file_type === "application/pdf" ||
                    d.name.toLowerCase().endsWith(".pdf"));
                const hasContent = !!(d.content && d.content.trim().length > 0);
                return (
                  <li
                    key={d.id}
                    className="py-3 flex items-center gap-3"
                  >
                    {d.type === "file" ? (
                      <FileText
                        className="w-4 h-4 text-[var(--ink-muted)] shrink-0"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Database
                        className="w-4 h-4 text-[var(--ink-muted)] shrink-0"
                        strokeWidth={1.5}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--ink)] truncate flex items-center gap-2">
                        {d.name}
                        {isPdf && hasContent && (
                          <span
                            title="PDF text extracted"
                            className="inline-flex items-center gap-0.5 text-[10px] text-[var(--verified)]"
                          >
                            <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                            extracted
                          </span>
                        )}
                        {isPdf && !hasContent && (
                          <span
                            title="Extracting PDF text…"
                            className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ink-subtle)]"
                          >
                            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                            processing
                          </span>
                        )}
                      </div>
                      {d.type === "text" && d.content && (
                        <div className="text-[11px] text-[var(--ink-subtle)] mt-0.5 line-clamp-1">
                          {d.content}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {d.file_url && (
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition"
                          title="Open file"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </a>
                      )}
                      <button
                        onClick={() => removeSource(d.id)}
                        className="p-1.5 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
