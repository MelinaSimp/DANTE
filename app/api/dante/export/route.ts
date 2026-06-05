// POST /api/dante/export — render a Dante chat message or analysis as a branded PDF.
//
// Request body:
//   { chatId: string, messageIds?: string[] }
//
// If messageIds is omitted, exports all assistant messages from the chat.
// Returns application/pdf with Content-Disposition: attachment.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderBrandedReport, type ReportSection } from "@/lib/pdf/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { chatId, messageIds } = body as {
    chatId?: string;
    messageIds?: string[];
  };

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  // Verify ownership
  const { data: chat } = await supabaseAdmin
    .from("dante_chats")
    .select("id, title, workspace_id, user_id")
    .eq("id", chatId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Fetch messages
  let query = supabaseAdmin
    .from("dante_chat_messages")
    .select("id, role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (messageIds?.length) {
    query = query.in("id", messageIds);
  } else {
    query = query.eq("role", "assistant");
  }

  const { data: messages, error: msgErr } = await query;
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  if (!messages?.length) {
    return NextResponse.json({ error: "No messages to export" }, { status: 400 });
  }

  // Build sections from messages. Strip markdown fenced blocks that
  // render as interactive components (```reasoning, ```map, etc.) and
  // keep the plain text content.
  const sections: ReportSection[] = messages.map((msg, i) => {
    const content = (msg as { content?: string }).content ?? "";
    // Strip fenced blocks that are visual-only
    const cleaned = content
      .replace(/```(?:reasoning|map|void_analysis|sources)[\s\S]*?```/g, "")
      .replace(/\[\[cite:.*?\]\]/g, "")
      .trim();

    const role = (msg as { role?: string }).role ?? "assistant";
    const timestamp = new Date((msg as { created_at?: string }).created_at ?? "").toLocaleString();

    return {
      heading: role === "user"
        ? `Question ${i + 1}`
        : `Response${messages.length > 2 ? ` ${i + 1}` : ""}`,
      body: `${cleaned}\n\n${timestamp}`,
    };
  });

  try {
    const pdfBuffer = await renderBrandedReport({
      workspaceId: chat.workspace_id,
      title: (chat as { title?: string }).title ?? "Dante Analysis",
      subtitle: `Exported ${new Date().toLocaleDateString()}`,
      sections,
    });

    const filename = `drift-export-${chatId.slice(0, 8)}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    console.error("[pdf-export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
