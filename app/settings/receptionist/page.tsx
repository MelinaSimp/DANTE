// app/settings/receptionist/page.tsx
import Link from "next/link";
import { ArrowLeft, Bot, ArrowUpRight } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/features/server";
import QuestionManager from "./QuestionManager";

export default async function ReceptionistSettingsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  await requireFeature(profile?.workspace_id, "ai_receptionist");

  if (!profile?.workspace_id) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
            Receptionist settings
          </h1>
          <div className="card-flat p-5 border-[var(--flag)]/30 bg-[var(--flag-soft)] mt-6">
            <p className="text-sm text-[var(--flag)]">
              No workspace found. Please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { data: questions } = await supabase
    .from("receptionist_questions")
    .select("id, prompt, expected_response, sort_order, created_at, updated_at")
    .eq("workspace_id", profile.workspace_id)
    .order("sort_order", { ascending: true });

  const { data: settings } = await supabase
    .from("receptionist_settings")
    .select("greeting, farewell, twilio_phone_number")
    .eq("workspace_id", profile.workspace_id)
    .maybeSingle();

  // Deep-link to the first voice agent's config page so the "Voice AI
  // config" callout below lands users in the editor in one click. If
  // there's no voice agent yet, we still send them to /agent where
  // they can create one.
  const { data: firstVoiceAgent } = await supabase
    .from("agents")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .in("modality", ["voice", "multi-modal"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const agentConfigHref = firstVoiceAgent?.id
    ? `/agent/${firstVoiceAgent.id}`
    : "/agent";

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--rule)] bg-[var(--canvas)] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="heading-display text-xl text-[var(--ink)]">Drift</span>
            <span className="label-section text-[var(--ink-muted)]">Receptionist</span>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to settings
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="heading-display text-4xl text-[var(--ink)] mb-1">
          Receptionist settings
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mb-6 max-w-2xl">
          Customize the questions your AI receptionist asks callers and the
          default greeting/farewell used on every call.
        </p>

        {/* Voice AI config callout — the deep controls (persona,
            knowledge base, voice selection, opening line) live on the
            per-agent page. We link there prominently so users don't
            assume this page is the only place to edit the agent. */}
        <Link
          href={agentConfigHref}
          className="card-flat mb-6 p-4 flex items-start gap-3 hover:border-[var(--ink)] transition group"
        >
          <div className="bg-[var(--canvas-subtle)] rounded-[4px] p-2.5 shrink-0">
            <Bot className="w-5 h-5 text-[var(--ink)]" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-[15px] font-semibold text-[var(--ink)]">
                Voice AI config
              </h3>
              <ArrowUpRight
                className="w-4 h-4 text-[var(--ink-subtle)] group-hover:text-[var(--ink)] transition"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              Persona &amp; system prompt, opening line, voice selection,
              and the knowledge base the agent can quote from on calls.
            </p>
          </div>
        </Link>

        <QuestionManager
          workspaceId={profile.workspace_id}
          initialQuestions={questions ?? []}
          initialSettings={
            settings ?? {
              greeting:
                "Hello! Thanks for calling. I just need a few quick details.",
              farewell:
                "Thanks for calling. Someone from the team will reach out shortly.",
              twilio_phone_number: null,
            }
          }
        />
      </div>
    </div>
  );
}
