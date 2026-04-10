import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || "America/New_York";
}

/**
 * Parse a datetime that has no timezone suffix (Z or ±offset).
 * Treat it as wall-clock time in APP_TIMEZONE and return UTC ISO for Supabase.
 */
export function naiveLocalIsoToUtcIso(input: string): string {
  const tz = getAppTimezone();
  const trimmed = input.trim();
  if (!trimmed) return new Date().toISOString();

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return dayjs(trimmed).toISOString();
  }

  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!m) {
    const d = dayjs(trimmed);
    return d.isValid() ? d.toISOString() : new Date().toISOString();
  }

  const datePart = m[1];
  let timePart = m[2];
  const parts = timePart.split(":");
  if (parts.length === 2) timePart = `${timePart}:00`;

  const local = dayjs.tz(`${datePart} ${timePart}`, "YYYY-MM-DD HH:mm:ss", tz);
  if (!local.isValid()) {
    return dayjs(trimmed).toISOString();
  }
  return local.utc().toISOString();
}

/** Inclusive start / exclusive end of calendar day `YYYY-MM-DD` in app TZ (UTC ISO strings). */
export function appDayRangeUtcIso(dateYmd: string): { startUtcIso: string; endExclusiveUtcIso: string } {
  const tz = getAppTimezone();
  const startLocal = dayjs.tz(dateYmd, "YYYY-MM-DD", tz).startOf("day");
  const endExclusiveLocal = startLocal.add(1, "day");
  return {
    startUtcIso: startLocal.utc().toISOString(),
    endExclusiveUtcIso: endExclusiveLocal.utc().toISOString(),
  };
}

/**
 * Wall-clock slot on a calendar date in app TZ → UTC ms for comparisons.
 */
export function appWallClockToUtcMs(dateYmd: string, hour: number, minute: number): number {
  const tz = getAppTimezone();
  const h = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return dayjs.tz(`${dateYmd} ${h}:${mi}:00`, "YYYY-MM-DD HH:mm:ss", tz).valueOf();
}
