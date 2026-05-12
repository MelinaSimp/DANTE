// /api/dante/chats/[id] — fetch one chat with full message history.
// DELETE soft-deletes the chat (sets deleted_at). Messages are preserved
// for compliance audit trails.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: chat, error: chatErr } = await supabaseAdmin
    .from("dante_chats")
    .select("id, title, workspace_id, user_id, created_at, updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (chatErr || !chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (chat.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("dante_chat_messages")
    .select("id, role, content, trace, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ chat, messages: messages || [] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify ownership before soft-deleting.
  const { data: chat } = await supabaseAdmin
    .from("dante_chats")
    .select("user_id, workspace_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("dante_chats")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit trail
  await supabaseAdmin.from("audit_events").insert({
    workspace_id: chat.workspace_id,
    actor_id: user.id,
    action: "chat.delete",
    resource_type: "dante_chat",
    resource_id: id,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
