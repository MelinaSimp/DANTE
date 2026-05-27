// app/dante/chat/[id]/page.tsx
//
// Dedicated chat view — full thread of (user, assistant) turns with
// the same Cmd+Enter input at the bottom for follow-ups. The agent
// loop on the API side already pulls prior turns into the objective
// (see /api/dante/ask), so multi-turn conversations carry context
// automatically.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArrowLeft } from "lucide-react";
import ChatThread from "./ChatThread";
import SourceViewerLayout from "@/components/dante/source-viewer/SourceViewerLayout";
import { getIndustryConfig } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: chat } = await supabaseAdmin
    .from("dante_chats")
    .select("id, title, user_id, workspace_id, created_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) redirect("/dante");

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("industry")
    .eq("id", chat.workspace_id)
    .maybeSingle();
  const brand = getIndustryConfig(ws?.industry);

  // Phase 3+ panel fix #2 — pull citation_report so chips render
  // decorated when the user opens yesterday's thread. grounding_score
  // and prompt_version come along for the ride (audit trail).
  const { data: messages } = await supabaseAdmin
    .from("dante_chat_messages")
    .select(
      "id, role, content, trace, citation_report, grounding_score, prompt_version, created_at",
    )
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 md:px-8 py-4 bg-[var(--canvas)] border-b border-[var(--rule)]">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/brand/logo-circle.png"
            alt="Drift"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-sm font-semibold text-[var(--ink)]">Drift</span>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <Link
            href="/dante"
            className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition"
          >
            {brand.assistantName}
          </Link>
          <span className="text-xs text-[var(--ink-subtle)]">/</span>
          <span className="text-xs text-[var(--ink)] truncate max-w-[400px]">
            {chat.title}
          </span>
        </div>
        <Link
          href="/dante"
          className="flex items-center gap-1.5 px-3 py-2 rounded-[4px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Back to {brand.assistantName}</span>
        </Link>
      </div>

      <SourceViewerLayout>
        <div className="px-6 md:px-8 py-8 max-w-5xl mx-auto">
          <ChatThread
            chatId={chat.id}
            initialMessages={
              (messages || []) as Array<{
                id: string;
                role: "user" | "assistant" | "tool";
                content: string;
                trace: unknown;
                citation_report?: unknown;
                grounding_score?: number | null;
                prompt_version?: string | null;
                created_at: string;
              }>
            }
          />
        </div>
      </SourceViewerLayout>
    </div>
  );
}
