import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Set up Google Calendar webhook subscription
 * POST /api/integrations/google-calendar/subscribe
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

    // Get workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { calendarId } = await req.json();
    const calendarIdToUse = calendarId || "primary";

    // Get Google credentials
    const { data: credentials } = await supabaseAdmin
      .from("integration_credentials")
      .select("encrypted_oauth_token, encrypted_refresh_token, token_expires_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("provider", "google")
      .eq("integration_type", "google")
      .maybeSingle();

    if (!credentials || !credentials.encrypted_oauth_token) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
    }

    // Decode token
    const oauthToken = Buffer.from(credentials.encrypted_oauth_token, "base64").toString("utf-8");

    // Get base URL for webhook
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.PUBLIC_BASE_URL || "";

    if (!baseUrl) {
      return NextResponse.json({ error: "Base URL not configured" }, { status: 500 });
    }

    const webhookUrl = `${baseUrl}/api/integrations/google-calendar/webhook`;
    
    // Generate unique channel ID
    const channelId = `calendar-${profile.workspace_id}-${Date.now()}`;
    const channelToken = `token-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Set up webhook subscription with Google Calendar
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarIdToUse}/events/watch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauthToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: channelToken,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google Calendar Subscribe] Failed to set up webhook:", errorText);
      
      if (response.status === 401) {
        // Token expired, try refresh
        const { GoogleCalendarAdapter } = await import("@/lib/integrations/adapters/google-calendar");
        const adapter = new GoogleCalendarAdapter();
        const refreshToken = credentials.encrypted_refresh_token
          ? Buffer.from(credentials.encrypted_refresh_token, "base64").toString("utf-8")
          : null;
        
        if (refreshToken) {
          const refreshedToken = await adapter.refreshToken(refreshToken);
          
          // Retry with refreshed token
          const retryResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarIdToUse}/events/watch`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: channelId,
                type: "web_hook",
                address: webhookUrl,
                token: channelToken,
              }),
            }
          );

          if (!retryResponse.ok) {
            const retryError = await retryResponse.text();
            return NextResponse.json(
              { error: `Failed to set up webhook: ${retryError}` },
              { status: 500 }
            );
          }

          const retryData = await retryResponse.json();
          
          // Store webhook info
          await supabaseAdmin
            .from("integration_credentials")
            .update({
              config: {
                calendar_id: calendarIdToUse,
                webhook_channel_id: channelId,
                webhook_resource_id: retryData.resourceId,
                webhook_expiration: retryData.expiration,
              },
            })
            .eq("workspace_id", profile.workspace_id)
            .eq("provider", "google")
            .eq("integration_type", "google");

          return NextResponse.json({
            success: true,
            channelId,
            resourceId: retryData.resourceId,
            expiration: retryData.expiration,
          });
        }
      }

      return NextResponse.json(
        { error: `Failed to set up webhook: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await response.json();

    // Store webhook info in integration_credentials config
    await supabaseAdmin
      .from("integration_credentials")
      .update({
        config: {
          calendar_id: calendarIdToUse,
          webhook_channel_id: channelId,
          webhook_resource_id: data.resourceId,
          webhook_expiration: data.expiration,
        },
      })
      .eq("workspace_id", profile.workspace_id)
      .eq("provider", "google")
      .eq("integration_type", "google");

    return NextResponse.json({
      success: true,
      channelId,
      resourceId: data.resourceId,
      expiration: data.expiration,
    });
  } catch (error: any) {
    console.error("[Google Calendar Subscribe] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

