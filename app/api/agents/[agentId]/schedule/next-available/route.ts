import { appDayRangeUtcIso, appWallClockToUtcMs, getAppTimezone } from "@/lib/app-timezone";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import dayjs from "dayjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const afterDate = searchParams.get("after") || new Date().toISOString().split("T")[0];
  const count = Math.min(parseInt(searchParams.get("count") || "3"), 5);

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .single();

  if (!agent) {
    return NextResponse.json({ slots: [] });
  }

  const results: { date: string; time: string; iso: string }[] = [];
  const tz = getAppTimezone();

  for (let dayOffset = 1; dayOffset <= 14 && results.length < count; dayOffset++) {
    const d = dayjs.tz(afterDate, "YYYY-MM-DD", tz).add(dayOffset, "day");
    const dateStr = d.format("YYYY-MM-DD");

    const { data: slots } = await supabaseAdmin
      .from("availability_slots")
      .select("start_time, end_time")
      .eq("workspace_id", agent.workspace_id)
      .eq("slot_date", dateStr);

    if (!slots || slots.length === 0) continue;

    const { startUtcIso, endExclusiveUtcIso } = appDayRangeUtcIso(dateStr);
    const { data: existingAppts } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at, duration_minutes")
      .eq("workspace_id", agent.workspace_id)
      .gte("scheduled_at", startUtcIso)
      .lt("scheduled_at", endExclusiveUtcIso)
      .neq("status", "cancelled");

    const busyTimes = (existingAppts || []).map((a) => ({
      start: new Date(a.scheduled_at).getTime(),
      end: new Date(a.scheduled_at).getTime() + (a.duration_minutes || 30) * 60000,
    }));

    const dayName = d.format("dddd, MMMM D");

    for (const slot of slots) {
      if (results.length >= count) break;
      const [sh, sm] = slot.start_time.split(":").map(Number);
      const [eh, em] = slot.end_time.split(":").map(Number);

      for (let h = sh; h < eh || (h === eh && 0 < em); h++) {
        if (results.length >= count) break;
        for (let m = h === sh ? sm : 0; m < 60; m += 30) {
          if (results.length >= count) break;
          if (h > eh || (h === eh && m >= em)) break;

          const slotStartMs = appWallClockToUtcMs(dateStr, h, m);
          const slotEndMs = slotStartMs + 30 * 60000;
          const isBusy = busyTimes.some((b) => slotStartMs < b.end && slotEndMs > b.start);

          if (!isBusy) {
            const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const ampm = h >= 12 ? "PM" : "AM";
            const displayMin = m === 0 ? "00" : String(m);
            results.push({
              date: dayName,
              time: `${displayHour}:${displayMin} ${ampm}`,
              iso: new Date(slotStartMs).toISOString(),
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ slots: results });
}
