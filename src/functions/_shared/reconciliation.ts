export function eventAtOrMin(value: unknown): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export function compareEventOrder(
  leftOccurredAtIso: unknown,
  leftEventId: unknown,
  rightOccurredAtIso: unknown,
  rightEventId: unknown
): number {
  const leftMs = eventAtOrMin(leftOccurredAtIso);
  const rightMs = eventAtOrMin(rightOccurredAtIso);

  if (leftMs !== rightMs) {
    return leftMs - rightMs;
  }

  const leftId = String(leftEventId ?? "").trim();
  const rightId = String(rightEventId ?? "").trim();
  return leftId.localeCompare(rightId);
}

export function shouldAdvanceEventState(
  occurredAtIso: string,
  eventId: string,
  currentLastEventAt: unknown,
  currentLastEventId: unknown
): boolean {
  return compareEventOrder(
    occurredAtIso,
    eventId,
    currentLastEventAt,
    currentLastEventId
  ) >= 0;
}

export function shouldAdvanceTouchpointAt(currentAt: unknown, occurredAtIso: string): boolean {
  return !currentAt || occurredAtIso > String(currentAt);
}

