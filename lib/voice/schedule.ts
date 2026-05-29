// lib/voice/schedule.ts
//
// Pure logic for deciding whether a voice agent is "in hours" right now.
// Kept side-effect-free so it's trivial to unit-test and to reuse from
// the webhook (real time) and the agent-config UI (preview "currently
// open / closed" indicator).

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

export interface ScheduleWindow {
  /** Wall-clock start, "HH:MM" (24h). Inclusive. */
  start: string;
  /** Wall-clock end, "HH:MM" (24h). Exclusive — "17:00" means open until 16:59:59. */
  end: string;
}

export interface AgentSchedule {
  /** IANA tz like "America/New_York". Falls back to APP_TIMEZONE → America/New_York. */
  timezone?: string;
  /** Per-day window arrays. Empty array = closed all day. Missing day = closed. */
  windows: Partial<Record<DayKey, ScheduleWindow[]>>;
}

export function isValidSchedule(value: unknown): value is AgentSchedule {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.windows || typeof v.windows !== "object") return false;
  for (const day of Object.keys(v.windows as object)) {
    if (!(DAY_KEYS as readonly string[]).includes(day)) return false;
  }
  return true;
}

/** "9:0" → "09:00", "9:30" → "09:30", "17" → "17:00". Lenient parser; we
 *  always re-emit in canonical HH:MM so downstream comparisons are
 *  string-stable. Returns null for un-parseable input. */
export function normalizeTimeStr(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h < 0 || h > 24) return null;
  if (min < 0 || min > 59) return null;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

/** Read the wall-clock parts of `now` in the given IANA timezone.
 *  Uses Intl — no dayjs dependency for this small slice. */
function nowInZone(tz: string, now: Date): { day: DayKey; hh: number; mm: number } {
  // 'short' parts; en-US gives us numeric weekday + 24h clock pieces.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday").toLowerCase().slice(0, 3) as DayKey;
  let hourStr = get("hour");
  // Intl quirk: with hour12:false, midnight can render as "24" in some
  // locales. Normalize to 0 so window comparisons work.
  let hh = parseInt(hourStr, 10);
  if (hh === 24) hh = 0;
  const mm = parseInt(get("minute"), 10);
  return { day: weekday, hh, mm };
}

export interface ScheduleEvaluation {
  /** True when the current moment falls inside any of today's windows. */
  open: boolean;
  /** The window the current moment falls in, if any. For diagnostics. */
  matched?: ScheduleWindow;
  /** Resolved timezone used for the check. */
  timezone: string;
  /** Current wall-clock in that timezone, for diagnostics. */
  now: { day: DayKey; hh: number; mm: number };
}

/** Evaluate whether the agent is currently in business hours.
 *  Defaults: tz=America/New_York, all days closed (open=false). */
export function evaluateSchedule(
  schedule: AgentSchedule | null | undefined,
  now: Date = new Date(),
  defaultTz: string = process.env.APP_TIMEZONE || "America/New_York",
): ScheduleEvaluation {
  const tz = schedule?.timezone || defaultTz;
  const cur = nowInZone(tz, now);
  if (!schedule?.windows) {
    return { open: false, timezone: tz, now: cur };
  }
  const todayWindows = schedule.windows[cur.day] || [];
  const curMinutes = cur.hh * 60 + cur.mm;
  for (const w of todayWindows) {
    const s = normalizeTimeStr(w.start);
    const e = normalizeTimeStr(w.end);
    if (!s || !e) continue;
    const [sH, sM] = s.split(":").map((n) => parseInt(n, 10));
    const [eH, eM] = e.split(":").map((n) => parseInt(n, 10));
    const sMin = sH * 60 + sM;
    const eMin = eH * 60 + eM;
    // start <= now < end. Overnight windows (end <= start) aren't
    // supported here — the UI should split them across the day boundary.
    if (curMinutes >= sMin && curMinutes < eMin) {
      return { open: true, matched: w, timezone: tz, now: cur };
    }
  }
  return { open: false, timezone: tz, now: cur };
}

/** Default empty schedule used when the user toggles "schedule enabled"
 *  for the first time. Weekdays 9-5, weekends closed, ET. */
export function defaultBusinessSchedule(): AgentSchedule {
  const std: ScheduleWindow[] = [{ start: "09:00", end: "17:00" }];
  return {
    timezone: process.env.APP_TIMEZONE || "America/New_York",
    windows: {
      mon: std,
      tue: std,
      wed: std,
      thu: std,
      fri: std,
      sat: [],
      sun: [],
    },
  };
}
