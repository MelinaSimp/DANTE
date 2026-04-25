// lib/integrations/microsoft-calendar/sync.ts
//
// Microsoft Graph calendar pull. Mirrors lib/integrations/calendar/sync.ts
// for Google. Same 30d-back / 90d-forward window, same attendee-match
// filter to keep personal events out of calendar_events.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/oauth/microsoft";

const GRAPH_API = "https://graph.microsoft.com/v1.0/me";

interface GraphEvent {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress: { address: string; name?: string };
    status?: { response?: string };
    type?: string;
  }>;
  isCancelled?: boolean;
  recurrence?: unknown | null;
  showAs?: string;
}

export interface CalendarSyncResult {
  fetched: number;
  upserted: number;
  matched_to_contacts: number;
}

export async function syncMicrosoftCalendar(input: {
  workspaceId: string;
  userId: string;
  pastDays?: number;
  futureDays?: number;
}): Promise<CalendarSyncResult> {
  const accessToken = await getValidAccessToken(input.workspaceId, input.userId);

  const past = input.pastDays ?? 30;
  const future = input.futureDays ?? 90;
  const startMin = new Date(Date.now() - past * 24 * 60 * 60 * 1000).toISOString();
  const startMax = new Date(Date.now() + future * 24 * 60 * 60 * 1000).toISOString();

  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", input.workspaceId);
  const contactByEmail = new Map<string, string>();
  for (const c of (contactRows || []) as Array<{ id: string; email: string | null }>) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
  }

  // calendarView expands recurrences into instances — analogous to
  // Google's singleEvents=true. We use the calendarView endpoint
  // instead of /events for that reason.
  const url =
    `${GRAPH_API}/calendarView?startDateTime=${startMin}&endDateTime=${startMax}` +
    `&$top=250&$select=id,subject,bodyPreview,start,end,location,attendees,isCancelled,recurrence,showAs`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Graph calendarView ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { value: GraphEvent[] };

  let fetched = 0;
  let upserted = 0;
  let matched = 0;

  for (const ev of json.value || []) {
    fetched++;
    if (ev.isCancelled) continue;

    const attendees = ev.attendees || [];
    const externalEmails = attendees
      .filter((a) => a.type !== "resource")
      .map((a) => a.emailAddress.address.toLowerCase());

    const matchedContactId =
      externalEmails.map((e) => contactByEmail.get(e)).find(Boolean) || null;
    if (!matchedContactId) continue;
    matched++;

    const { error } = await supabaseAdmin.from("calendar_events").upsert(
      {
        workspace_id: input.workspaceId,
        contact_id: matchedContactId,
        provider: "microsoft",
        provider_event_id: ev.id,
        calendar_id: "primary",
        summary: ev.subject || null,
        description: ev.bodyPreview || null,
        location: ev.location?.displayName || null,
        start_at: new Date(ev.start.dateTime + "Z").toISOString(),
        end_at: new Date(ev.end.dateTime + "Z").toISOString(),
        attendees: ev.attendees || [],
        status: ev.showAs || null,
        is_recurring: !!ev.recurrence,
      },
      { onConflict: "workspace_id,provider_event_id" },
    );
    if (!error) upserted++;
  }

  return { fetched, upserted, matched_to_contacts: matched };
}
