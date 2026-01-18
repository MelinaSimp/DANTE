// app/api/test-sms/route.ts
// Test endpoint to verify SMS sending functionality

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import twilio from "twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Test SMS sending
 * POST /api/test-sms
 * Body: { phoneNumber: string, message?: string }
 */
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
    const { phoneNumber, message } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: "phoneNumber is required" }, { status: 400 });
    }

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    // Get Twilio credentials
    const { data: twilioCreds } = await supabaseAdmin
      .from("twilio_credentials")
      .select("account_sid, auth_token")
      .eq("workspace_id", profile.workspace_id)
      .maybeSingle();

    let accountSid: string | null = null;
    let authToken: string | null = null;

    if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
      accountSid = twilioCreds.account_sid;
      authToken = twilioCreds.auth_token;
    } else {
      // Fallback to environment variables
      accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_MASTER_ACCOUNT_SID || null;
      authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_MASTER_AUTH_TOKEN || null;
    }

    if (!accountSid || !authToken) {
      return NextResponse.json({ 
        error: "Twilio credentials not found",
        details: "Please configure Twilio credentials in Data Sources or environment variables"
      }, { status: 500 });
    }

    // Get agent phone number (for "from" number)
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, phone_number, name")
      .eq("workspace_id", profile.workspace_id)
      .not("phone_number", "is", null)
      .limit(1)
      .maybeSingle();

    if (!agent?.phone_number) {
      return NextResponse.json({ 
        error: "No agent phone number found",
        details: "Please configure a phone number for your agent in Advanced → Phone Number Setup"
      }, { status: 500 });
    }

    // Send SMS
    const client = twilio(accountSid, authToken);
    const testMessage = message || `Test SMS from ${agent.name || 'Drift AI'}. This is a test message to verify SMS functionality.`;
    
    console.log(`[Test SMS] Attempting to send SMS:`, {
      to: normalizedPhone,
      from: agent.phone_number,
      message: testMessage.substring(0, 50) + '...',
    });

    const twilioMessage = await client.messages.create({
      body: testMessage,
      from: agent.phone_number,
      to: normalizedPhone,
    });

    console.log(`[Test SMS] Twilio message created:`, {
      sid: twilioMessage.sid,
      status: twilioMessage.status,
      to: twilioMessage.to,
      from: twilioMessage.from,
    });

    return NextResponse.json({
      success: true,
      message: "SMS sent successfully",
      twilioMessage: {
        sid: twilioMessage.sid,
        status: twilioMessage.status,
        to: twilioMessage.to,
        from: twilioMessage.from,
        dateCreated: twilioMessage.dateCreated,
      },
      details: {
        message: "Check your phone for the test message. If you don't receive it, check your Twilio Console for delivery status.",
        twilioConsoleUrl: `https://console.twilio.com/us1/monitor/logs/sms?sid=${twilioMessage.sid}`,
      },
    });
  } catch (error: any) {
    console.error("[Test SMS] Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to send SMS",
      details: error.code ? `Twilio error code: ${error.code}` : null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }, { status: 500 });
  }
}



