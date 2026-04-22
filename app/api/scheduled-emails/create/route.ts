// app/api/scheduled-emails/create/route.ts
// Create a scheduled email reminder

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireActiveBilling } from "@/lib/billing/gate";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subject, htmlContent, scheduledAt, toEmail } = body;

    if (!subject || !htmlContent || !scheduledAt) {
      return NextResponse.json(
        { error: "Missing required fields: subject, htmlContent, scheduledAt" },
        { status: 400 }
      );
    }

    // Get user's email as recipient if not specified
    const recipientEmail = toEmail || user.email;
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "No recipient email available" },
        { status: 400 }
      );
    }

    // Get workspace and agent
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const gate = await requireActiveBilling(profile.workspace_id);
    if (!gate.ok) return gate.response;

    // Get the first agent in this workspace (for the required agent_id FK)
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("workspace_id", profile.workspace_id)
      .limit(1)
      .maybeSingle();

    if (!agent?.id) {
      return NextResponse.json({ error: "No agent found in workspace" }, { status: 400 });
    }

    const { data: email, error } = await supabaseAdmin
      .from("scheduled_emails")
      .insert({
        to_email: recipientEmail,
        subject,
        html_content: htmlContent,
        scheduled_at: scheduledAt,
        status: "pending",
        workspace_id: profile.workspace_id,
        agent_id: agent.id,
        metadata: { created_by: user.id },
      })
      .select("id, scheduled_at, status")
      .single();

    if (error) {
      console.error("[Scheduled Emails] Create error:", error);
      // If table doesn't exist, provide helpful message
      if (error.code === "42P01") {
        return NextResponse.json({ 
          error: "The scheduled_emails table needs to be created. Please run the migration: supabase/migrations/add_scheduled_emails_table.sql" 
        }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to create reminder: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ email });
  } catch (error: any) {
    console.error("[Scheduled Emails] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
