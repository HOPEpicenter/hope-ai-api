import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type CanonicalEngagementStatus = "ENGAGED" | "DISENGAGED";

export type EngagementStatusV1 = {
  v: 1;
  visitorId: string;
  status: CanonicalEngagementStatus | null;
  lastChangedAt: string | null;
  lastEventId: string | null;
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function normalizeStatus(v: unknown): CanonicalEngagementStatus | null {
  if (!isString(v)) return null;

  const trimmed = v.trim().toUpperCase();
  if (trimmed === "ENGAGED") return "ENGAGED";
  if (trimmed === "DISENGAGED") return "DISENGAGED";
  return null;
}

function readStatusTransition(
  evt: EngagementEventEnvelopeV1
): { from: CanonicalEngagementStatus | null; to: CanonicalEngagementStatus | null } | null {
  if (evt.type !== "status.transition") return null;

  const d: any = evt.data ?? {};
  if (!d || typeof d !== "object") return null;

  return {
    from: normalizeStatus(d.from),
    to: normalizeStatus(d.to),
  };
}

function toMillis(iso: string | null | undefined): number {
  if (!iso || !isString(iso)) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Derive current status from status.transition events.
 *
 * Rules:
 * - process oldest -> newest by occurredAt
 * - first valid status must land on ENGAGED
 * - initial duplicate transition is ignored
 * - duplicate transitions are ignored
 * - invalid transitions are ignored
 * - latest valid transition wins
 */
export function deriveEngagementStatusFromEvents(
  visitorId: string,
  events: EngagementEventEnvelopeV1[]
): EngagementStatusV1 {
  const ordered = (Array.isArray(events) ? events.slice() : []).sort(
    (a, b) => toMillis(a?.occurredAt) - toMillis(b?.occurredAt)
  );

  let status: CanonicalEngagementStatus | null = null;
  let lastChangedAt: string | null = null;
  let lastEventId: string | null = null;

  for (const evt of ordered) {
    const st = readStatusTransition(evt);
    if (!st || !st.to) {
      continue;
    }

    const from = st.from;
    const to = st.to;

    if (status === null) {
      if (to !== "ENGAGED") {
        continue;
      }

      if (from === to) {
        continue;
      }

      status = to;
      lastChangedAt = evt.occurredAt ?? null;
      lastEventId = evt.eventId ?? null;
      continue;
    }

    if (to === status) {
      continue;
    }

    const isAllowed =
      (status === "ENGAGED" && to === "DISENGAGED") ||
      (status === "DISENGAGED" && to === "ENGAGED");

    if (!isAllowed) {
      continue;
    }

    status = to;
    lastChangedAt = evt.occurredAt ?? null;
    lastEventId = evt.eventId ?? null;
  }

  return {
    v: 1,
    visitorId,
    status,
    lastChangedAt,
    lastEventId,
  };
}

export function deriveEngagementStatus(
  events: EngagementEventEnvelopeV1[] | null | undefined
): CanonicalEngagementStatus | null {
  const result = deriveEngagementStatusFromEvents("derived", Array.isArray(events) ? events : []);
  return result.status;
}

export default deriveEngagementStatusFromEvents;
