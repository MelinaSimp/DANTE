// lib/integrations/calendar/sync.ts
//
// Pulls Google Calendar events for a connected advisor and writes
// them into `calendar_events`. Same shape as the Gmail sync — we
// only persist events that have at least one attendee matching a
// known contact, to keep the table from filling with personal
// "lunch with mom" rows.
//
// This is a polling sync; Google supports push notifications via
// the Watch API (channels.watch on /events), but that's a Phase 3+
// optimization. For an advisor with ~50 client meetings a month,
// 6h polling is fine.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/oauth/google";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
  }>;
  recurringEventId?: string;
}

interface SyncInput {
  workspaceId: string;
  userId: string;
  /** Look back / forward this many days. Defaults: 30 back, 90 forward. */
  pastDays?: number;
  futureDays?: number;
}

export interface CalendarSyncResult {
  fetched: number;
  upserted: number;
  matched_to_contacts: number;
}

export async function syncGoogleCalendar(input: SyncInput): Promise<CalendarSyncResult> {
  const accessToken = await getValidAccessToken(input.workspaceId, input.userId);

  const past = input.pastDays ?? 30;
  const future = input.futureDays ?? 90;
  const timeMin = new Date(Date.now() - past * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + future * 24 * 60 * 60 * 1000).toISOString();

  // Pre-fetch contact emails for matching.
  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", input.workspaceId);
  const contactByEmail = new Map<string, string>();
  for (const c of (contactRows || []) as Array<{ id: string; email: string | null }>) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
  }

  let pageToken: string | undefined;
  let fetched = 0;
  let upserted = 0;
  let matched = 0;

  // We only sync the advisor's primary calendar in Phase 2. Multi-
  // calendar selection is a settings UI for later.
  for (let page = 0; page < 5; page++) {
    const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true"); // expand recurrences into instances
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Calendar list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    pageToken = json.nextPageToken;

    for (const ev of json.items || []) {
      fetched++;

      // Skip cancellations and all-day no-attendee events. The first
      // is noise, the second is "block out 2pm" personal stuff.
      if (ev.status === "cancelled") continue;
      const startStr = ev.start.dateTime || ev.start.date;
      const endStr = ev.end.dateTime || ev.end.date;
      if (!startStr || !endStr) continue;

      const attendeeEmails = (ev.attendees || [])
        .filter((a) => !a.self)
        .map((a) => a.email.toLowerCase());

      // Find the first attendee that's a known contact. Most client
      // meetings have one external person; if the meeting has multiple
      // contacts (a couple's review meeting), we link the first and
      // surface the rest in the attendees jsonb.
      const matchedContactId =
        attendeeEmails.map((e) => contactByEmail.get(e)).find(Boolean) || null;

      if (!matchedContactId) continue;
      matched++;

      const { error } = await supabaseAdmin
        .from("calendar_events")
        .upsert(
          {
            workspace_id: input.workspaceId,
            contact_id: matchedContactId,
            provider: "google",
            provider_event_id: ev.id,
            calendar_id: "primary",
            summary: ev.summary || null,
            description: ev.description || null,
            location: ev.location || null,
            start_at: new Date(startStr).toISOString(),
            end_at: new Date(endStr).toISOString(),
            attendees: ev.attendees || [],
            status: ev.status || null,
            is_recurring: !!ev.recurringEventId,
          },
          { onConflict: "workspace_id,provider_event_id" },
        );
      if (!error) upserted++;
    }

    if (!pageToken) break;
  }

  return { fetched, upserted, matched_to_contacts: matched };
}
