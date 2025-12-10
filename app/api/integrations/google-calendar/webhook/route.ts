import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Google Calendar Webhook
 * POST /api/integrations/google-calendar/webhook
 * 
 * Receives push notifications from Google Calendar when events are created/updated
 */
export async function POST(req: NextRequest) {
  try {
    const headers = req.headers;
    const xGoogChannelId = headers.get("X-Goog-Channel-Id");
    const xGoogResourceId = headers.get("X-Goog-Resource-Id");
    const xGoogResourceState = headers.get("X-Goog-Resource-State");
    const xGoogResourceUri = headers.get("X-Goog-Resource-Uri");

    console.log("[Google Calendar Webhook] Received notification:", {
      channelId: xGoogChannelId,
      resourceId: xGoogResourceId,
      resourceState: xGoogResourceState,
      resourceUri: xGoogResourceUri,
    });

    // Handle sync notification (initial webhook setup)
    if (xGoogResourceState === "sync") {
      console.log("[Google Calendar Webhook] Sync notification received");
      return NextResponse.json({ success: true, message: "Webhook synced" });
    }

    // Handle change notification
    if (xGoogResourceState === "exists" && xGoogResourceUri) {
      // Extract calendar ID from resource URI
      // Format: https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
      const calendarIdMatch = xGoogResourceUri.match(/calendars\/([^\/]+)/);
      if (!calendarIdMatch) {
        console.error("[Google Calendar Webhook] Could not extract calendar ID from URI");
        return NextResponse.json({ error: "Invalid resource URI" }, { status: 400 });
      }

      const calendarId = calendarIdMatch[1];

      // Find workspace with this calendar integration
      const { data: integration } = await supabaseAdmin
        .from("integration_credentials")
        .select("workspace_id, config")
        .eq("provider", "google")
        .eq("integration_type", "google")
        .maybeSingle();

      if (!integration) {
        console.error("[Google Calendar Webhook] No Google integration found");
        return NextResponse.json({ error: "Integration not found" }, { status: 404 });
      }

      // Get credentials
      const { data: credentials } = await supabaseAdmin
        .from("integration_credentials")
        .select("encrypted_oauth_token, encrypted_refresh_token, token_expires_at")
        .eq("workspace_id", integration.workspace_id)
        .eq("provider", "google")
        .eq("integration_type", "google")
        .maybeSingle();

      if (!credentials) {
        console.error("[Google Calendar Webhook] No credentials found");
        return NextResponse.json({ error: "Credentials not found" }, { status: 404 });
      }

      // Decode tokens
      const oauthToken = Buffer.from(credentials.encrypted_oauth_token, "base64").toString("utf-8");
      const refreshToken = credentials.encrypted_refresh_token
        ? Buffer.from(credentials.encrypted_refresh_token, "base64").toString("utf-8")
        : null;

      // Fetch recent events from calendar
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
        `timeMin=${timeMin}&` +
        `timeMax=${timeMax}&` +
        `singleEvents=true&` +
        `orderBy=startTime&` +
        `maxResults=50`,
        {
          headers: {
            Authorization: `Bearer ${oauthToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try refresh
          const { GoogleCalendarAdapter } = await import("@/lib/integrations/adapters/google-calendar");
          const adapter = new GoogleCalendarAdapter();
          const refreshedToken = await adapter.refreshToken(refreshToken || "");
          
          // Retry with refreshed token
          const retryResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
            `timeMin=${timeMin}&` +
            `timeMax=${timeMax}&` +
            `singleEvents=true&` +
            `orderBy=startTime&` +
            `maxResults=50`,
            {
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!retryResponse.ok) {
            console.error("[Google Calendar Webhook] Failed to fetch events after refresh");
            return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
          }

          const data = await retryResponse.json();
          await processNewEvents(data.items || [], integration.workspace_id);
        } else {
          console.error("[Google Calendar Webhook] Failed to fetch events:", response.status);
          return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
        }
      } else {
        const data = await response.json();
        await processNewEvents(data.items || [], integration.workspace_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Google Calendar Webhook] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * Process new calendar events and schedule SMS reminders
 */
async function processNewEvents(events: any[], workspaceId: string) {
  for (const event of events) {
    try {
      // Check if we've already processed this event
      const eventId = event.id;
      const { data: existing } = await supabaseAdmin
        .from("scheduled_sms")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .filter("metadata->>google_event_id", "eq", eventId)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`[Google Calendar Webhook] Event ${eventId} already has reminders scheduled`);
        continue;
      }

      // Extract event details
      const startTime = event.start?.dateTime || event.start?.date;
      if (!startTime) continue;

      const eventDate = new Date(startTime);
      const now = new Date();

      // Only process future events
      if (eventDate <= now) {
        console.log(`[Google Calendar Webhook] Event ${eventId} is in the past, skipping`);
        continue;
      }

      const summary = event.summary || "Appointment";
      const description = event.description || "";
      
      // Extract phone number from description or attendees
      let phoneNumber: string | null = null;
      
      // Try to extract from description (common formats)
      const phoneRegex = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
      const phoneMatch = description.match(phoneRegex);
      if (phoneMatch && phoneMatch.length > 0) {
        phoneNumber = normalizePhone(phoneMatch[0]);
      }

      // Try to get from attendees
      if (!phoneNumber && event.attendees) {
        for (const attendee of event.attendees) {
          if (attendee.email) {
            // Try to find contact by email
            const { data: contact } = await supabaseAdmin
              .from("contacts")
              .select("phone")
              .eq("workspace_id", workspaceId)
              .eq("email", attendee.email)
              .maybeSingle();
            
            if (contact?.phone) {
              phoneNumber = normalizePhone(contact.phone);
              break;
            }
          }
        }
      }

      if (!phoneNumber) {
        console.log(`[Google Calendar Webhook] No phone number found for event ${eventId}, skipping SMS reminders`);
        continue;
      }

      // Get agent for this workspace (use first agent with phone number)
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id, phone_number")
        .eq("workspace_id", workspaceId)
        .not("phone_number", "is", null)
        .limit(1)
        .maybeSingle();

      if (!agent) {
        console.log(`[Google Calendar Webhook] No agent with phone number found for workspace ${workspaceId}`);
        continue;
      }

      // Calculate reminder times
      const reminderTimes = [
        { label: "1 day", minutes: 24 * 60 },      // 1 day before
        { label: "12 hours", minutes: 12 * 60 },   // 12 hours before
        { label: "1 hour", minutes: 60 },           // 1 hour before
        { label: "30 minutes", minutes: 30 },       // 30 minutes before
      ];

      // Create reminder messages
      const reminders = reminderTimes.map(({ label, minutes }) => {
        const reminderTime = new Date(eventDate.getTime() - minutes * 60 * 1000);
        
        // Only schedule if reminder time is in the future
        if (reminderTime <= now) {
          return null;
        }

        return {
          workspace_id: workspaceId,
          agent_id: agent.id,
          phone_number: phoneNumber!,
          message: `Reminder: ${summary} is in ${label}. ${description ? `Details: ${description.substring(0, 100)}` : ""}`,
          scheduled_at: reminderTime.toISOString(),
          status: "pending",
          metadata: {
            google_event_id: eventId,
            reminder_type: label,
            event_summary: summary,
            event_start: startTime,
          },
        };
      }).filter(Boolean);

      // Add immediate test message (scheduled for 10 seconds from now for testing)
      const immediateTestMessage = {
        workspace_id: workspaceId,
        agent_id: agent.id,
        phone_number: phoneNumber!,
        message: `✅ Google Calendar connected! Event "${summary}" detected. Reminders scheduled for 1 day, 12 hours, 1 hour, and 30 minutes before the event.`,
        scheduled_at: new Date(Date.now() + 10 * 1000).toISOString(), // 10 seconds from now
        status: "pending",
        metadata: {
          google_event_id: eventId,
          reminder_type: "immediate_test",
          event_summary: summary,
          event_start: startTime,
        },
      };
      
      reminders.push(immediateTestMessage);

      if (reminders.length === 0) {
        console.log(`[Google Calendar Webhook] No valid reminder times for event ${eventId}`);
        continue;
      }

      // Insert scheduled SMS reminders
      const { error: insertError } = await supabaseAdmin
        .from("scheduled_sms")
        .insert(reminders);

      if (insertError) {
        console.error(`[Google Calendar Webhook] Failed to schedule reminders for event ${eventId}:`, insertError);
      } else {
        console.log(`[Google Calendar Webhook] Scheduled ${reminders.length} reminders for event ${eventId}`);
      }
    } catch (error: any) {
      console.error(`[Google Calendar Webhook] Error processing event:`, error);
    }
  }
}

