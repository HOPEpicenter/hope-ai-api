import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export type EngagementStatusV1 = {
  v: 1;
  visitorId: string;
  status: string | null;       // null if unknown / no transitions
  lastChangedAt: string | null; // occurredAt of last transition
  lastEventId: string | null;
};

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function readStatusTransition(evt: EngagementEventEnvelopeV1): { to: string } | null {
  if (evt.type !== "status.transition") return null;
  const d: any = evt.data ?? {};
  if (!d || typeof d !== "object") return null;
  if (!isString(d.to) || d.to.length < 1) return null;
  return { to: d.to };
}

/**
 * Derive the current status from an ordered event list.
 * Expectation: events are in ascending time order (oldest -> newest).
 * If your timeline read returns a different order, sort before calling.
 */
export function deriveEngagementStatusFromEvents(
  visitorId: string,
  events: EngagementEventEnvelopeV1[]
): EngagementStatusV1 {
  let status: string | null = null;
  let lastChangedAt: string | null = null;
  let lastEventId: string | null = null;

  for (const evt of events) {
    const st = readStatusTransition(evt);
    if (!st) continue;

    status = st.to;
    lastChangedAt = evt.occurredAt;
    lastEventId = evt.eventId;
  }

  return { v: 1, visitorId, status, lastChangedAt, lastEventId };
}
