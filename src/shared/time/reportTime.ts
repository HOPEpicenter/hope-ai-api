import { DateTime } from "luxon";

/**
 * Reporting timezone for bucket boundaries.
 */
export const REPORT_TZ = "America/New_York";

/**
 * Rolling window range in UTC ISO.
 */
export function getWindowRangeUtc(windowDays: number): { startIso: string; endIso: string } {
  const end = DateTime.utc();
  const start = end.minus({ days: windowDays });
  return { startIso: start.toISO()!, endIso: end.toISO()! };
}

/**
 * Calendar week range (Mon 00:00 America/New_York -> next Mon 00:00) returned as UTC ISO boundaries.
 * weeksBack=0 => current week.
 * weeksBack=1 => previous week.
 */
export function getWeekRangeUtc(weeksBack: number = 0): { weekStartLocal: string; weekStartIso: string; weekEndIso: string } {
  const nowLocal = DateTime.now().setZone(REPORT_TZ);

  // ISO weekday: Monday = 1 ... Sunday = 7
  const weekStartLocal = nowLocal
    .minus({ weeks: weeksBack })
    .startOf("day")
    .minus({ days: nowLocal.weekday - 1 })
    .startOf("day");

  const weekEndLocal = weekStartLocal.plus({ days: 7 });

  return {
    weekStartLocal: weekStartLocal.toISODate()!,
    weekStartIso: weekStartLocal.toUTC().toISO()!,
    weekEndIso: weekEndLocal.toUTC().toISO()!,
  };
}

/**
 * Returns recent calendar week buckets, oldest -> newest.
 */
export function getRecentWeekBucketsUtc(weeks: number): Array<{ weekStartLocal: string; weekStartIso: string; weekEndIso: string }> {
  const out: Array<{ weekStartLocal: string; weekStartIso: string; weekEndIso: string }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push(getWeekRangeUtc(i));
  }
  return out;
}
