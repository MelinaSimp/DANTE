// app/api/scheduled-sms/process/route.ts
// Background job to send scheduled SMS messages
// Should be called by Vercel Cron or external cron service

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import twilio from "twilio";
import { recordSmsUsage } from "@/lib/usage/track";
import { decryptSecret } from "@/lib/crypto/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 seconds for batch processing

/**
 * Process scheduled SMS messages
 * GET /api/scheduled-sms/process
 * 
 * This endpoint is called by Vercel Cron daily at midnight (Hobby plan limitation)
 * For more frequent processing, upgrade to Pro plan or use external cron service
 * 
 * Note: Immediate reminders are sent right away when appointments are created (for testing)
 */
export async function GET(req: NextRequest) {
  try {
    // Optional: Add authentication/authorization
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Find pending SMS scheduled for now or earlier
    const now = new Date().toISOString();
    const { data: pendingSMS, error } = await supabaseAdmin
      .from("scheduled_sms")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(100); // Process up to 100 at a time
    
    if (error) {
      console.error("[Scheduled SMS] Error fetching scheduled SMS:", error);
      return NextResponse.json({ error: "Failed to fetch scheduled SMS" }, { status: 500 });
    }
    
    if (!pendingSMS || pendingSMS.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0 });
    }

    const workspaceIds = Array.from(
      new Set(pendingSMS.map((s) => s.workspace_id).filter(Boolean))
    );
    const activeWorkspaces = new Set<string>();
    if (workspaceIds.length > 0) {
      const { data: wsRows } = await supabaseAdmin
        .from("workspaces")
        .select("id, plan_status")
        .in("id", workspaceIds);
      for (const w of wsRows ?? []) {
        if (w.plan_status === "active" || w.plan_status === "trialing") {
          activeWorkspaces.add(w.id);
        }
      }
    }

    let processed = 0;
    let failed = 0;
    let skippedBilling = 0;

    for (const sms of pendingSMS) {
      if (sms.workspace_id && !activeWorkspaces.has(sms.workspace_id)) {
        await supabaseAdmin
          .from("scheduled_sms")
          .update({
            status: "failed",
            error_message: "Workspace billing not active",
            error_code: "billing_inactive",
          })
          .eq("id", sms.id);
        skippedBilling++;
        continue;
      }
      try {
        // Get Twilio credentials
        const { data: twilioCreds } = await supabaseAdmin
          .from("twilio_credentials")
          .select("account_sid, auth_token")
          .eq("workspace_id", sms.workspace_id)
          .maybeSingle();
        
        let accountSid: string | null = null;
        let authToken: string | null = null;
        
        if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
          accountSid = twilioCreds.account_sid;
          // auth_token encrypted at rest; decryptSecret handles legacy plaintext too.
          authToken = decryptSecret(twilioCreds.auth_token);
        } else {
          // Fallback to environment variables
          accountSid = process.env.TWILIO_ACCOUNT_SID || null;
          authToken = process.env.TWILIO_AUTH_TOKEN || null;
        }
        
        if (!accountSid || !authToken) {
          throw new Error("Twilio credentials not found");
        }
        
        // Get agent phone number
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("phone_number")
          .eq("id", sms.agent_id)
          .single();
        
        if (!agent?.phone_number) {
          throw new Error("Agent phone number not found");
        }
        
        // Send SMS
        const client = twilio(accountSid, authToken);
        const message = await client.messages.create({
          body: sms.message,
          from: agent.phone_number,
          to: sms.phone_number,
        });
        
        // Update status
        await supabaseAdmin
          .from("scheduled_sms")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", sms.id);

        if (sms.workspace_id) {
          recordSmsUsage({
            workspaceId: sms.workspace_id,
            source: "scheduled",
            metadata: { scheduled_sms_id: sms.id, twilio_sid: message.sid },
          });
        }

        processed++;
        console.log(`[Scheduled SMS] Sent SMS ${sms.id} to ${sms.phone_number}`);
      } catch (error: any) {
        console.error(`[Scheduled SMS] Failed to send SMS ${sms.id}:`, error);
        
        // Determine if error is retryable
        const isRetryable = error.code === 20003 || // Unreachable
                           error.code === 429 ||    // Rate limit
                           error.message?.includes('timeout');
        
        // Update status
        await supabaseAdmin
          .from("scheduled_sms")
          .update({
            status: isRetryable ? "pending" : "failed",
            error_message: error.message || String(error),
            error_code: error.code || null,
            // If retryable, reschedule for 5 minutes later
            scheduled_at: isRetryable ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : sms.scheduled_at,
          })
          .eq("id", sms.id);
        
        failed++;
      }
    }
    
    return NextResponse.json({ processed, failed, skipped_billing: skippedBilling });
  } catch (error: any) {
    console.error("[Scheduled SMS] Error processing scheduled SMS:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

