/**
 * LLM Guidelines API
 * GET, POST, PUT, DELETE /api/llm/guidelines
 * 
 * Manages templates and guidelines for LLM interactions
 * Supports both per-agent and per-chat templates
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const chatId = searchParams.get("chatId");

    if (!agentId && !chatId) {
      return NextResponse.json({ error: "agentId or chatId required" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("llm_guidelines")
      .select("*")
      .eq("is_active", true);

    if (agentId && chatId) {
      // Get both agent and chat templates
      query = query.or(`agent_id.eq.${agentId},chat_id.eq.${chatId}`);
    } else if (agentId) {
      query = query.eq("agent_id", agentId);
    } else if (chatId) {
      query = query.eq("chat_id", chatId);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching guidelines:", error);
      return NextResponse.json({ error: "Failed to fetch guidelines" }, { status: 500 });
    }

    return NextResponse.json({ guidelines: data || [] });
  } catch (error: any) {
    console.error("Guidelines API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId, chatId, name, template, isAgentTemplate } = await req.json();

    if (!template || typeof template !== "string") {
      return NextResponse.json({ error: "Template content is required" }, { status: 400 });
    }

    if (!agentId && !chatId) {
      return NextResponse.json({ error: "agentId or chatId required" }, { status: 400 });
    }

    // Verify user has access to agent or chat
    if (agentId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.workspace_id) {
        return NextResponse.json({ error: "No workspace found" }, { status: 400 });
      }

      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id, workspace_id")
        .eq("id", agentId)
        .eq("workspace_id", profile.workspace_id)
        .single();

      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
    }

    if (chatId) {
      const { data: chat } = await supabaseAdmin
        .from("llm_chats")
        .select("id, user_id")
        .eq("id", chatId)
        .single();

      if (!chat || chat.user_id !== user.id) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }
    }

    const { data: guideline, error } = await supabaseAdmin
      .from("llm_guidelines")
      .insert({
        agent_id: agentId || null,
        chat_id: chatId || null,
        name: name || "Default Template",
        template,
        is_agent_template: isAgentTemplate !== false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating guideline:", error);
      return NextResponse.json({ error: "Failed to create guideline" }, { status: 500 });
    }

    return NextResponse.json({ guideline });
  } catch (error: any) {
    console.error("Guidelines API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, name, template, isActive } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Guideline ID is required" }, { status: 400 });
    }

    // Verify user has access
    const { data: existing } = await supabaseAdmin
      .from("llm_guidelines")
      .select("agent_id, chat_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Guideline not found" }, { status: 404 });
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (template !== undefined) updateData.template = template;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: guideline, error } = await supabaseAdmin
      .from("llm_guidelines")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating guideline:", error);
      return NextResponse.json({ error: "Failed to update guideline" }, { status: 500 });
    }

    return NextResponse.json({ guideline });
  } catch (error: any) {
    console.error("Guidelines API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Guideline ID is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("llm_guidelines")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting guideline:", error);
      return NextResponse.json({ error: "Failed to delete guideline" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Guidelines API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
