/**
 * Canonical Global Timeline row-key algorithm, extracted unchanged from
 * GlobalTimelineRepository so it can be reused without importing storage clients.
 * Dependency-free and side-effect free. Not the 15-digit algorithm in timelineOrdering.ts.
 */

export function toTicksDescending(iso: string): string {
  const ms = Date.parse(iso);
  const safeMs = Number.isFinite(ms) ? ms : 0;

  const max = 9999999999999;
  const desc = Math.max(0, max - safeMs);

  return String(desc).padStart(13, "0");
}

export function buildRowKey(item: {
  occurredAt: string;
  eventId: string;
}): string {
  return `${toTicksDescending(item.occurredAt)}|${item.eventId}`;
}
