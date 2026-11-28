import {
  resolveVisitorEventContext,
  type VisitorEvent
} from "./resolveVisitorEventContext";

/**
 * Internal, pure admission policy assessment.
 *
 * Policy and approved events must originate from trusted
 * server-side authority, never from visitor request JSON.
 *
 * This module grants no Staff authority, issues no credentials,
 * performs no persistence and activates no communication.
 */
export type PermanentVisitorAdmissionPolicy = Readonly<{
  enabled?: boolean;
  ownerActivated?: boolean;

  // Trusted activation identity. QR admission requires
  // a fresh identity for every owner reactivation.
  activationId?: string;
  eventId: string;
  date: string;
  opensAtMs: number;
  closesAtMs: number;
}>;

export type PermanentVisitorAdmissionEventResult =
  | Readonly<{ admitted: false }>
  | Readonly<{
      admitted: true;
      serviceId: string;
      date: string;
      opensAtMs: number;
      closesAtMs: number;
    }>;

function denied(): PermanentVisitorAdmissionEventResult {
  return { admitted: false };
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    Number.isFinite(new Date(value).getTime());
}

function easternDate(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(ms));

  const part = (type: string) =>
    parts.find(value => value.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function assessPermanentVisitorAdmissionEvent(input: {
  policy?: PermanentVisitorAdmissionPolicy | null;
  selectedEventId?: unknown;
  approvedEvents: readonly VisitorEvent[];
  nowMs: number;
}): PermanentVisitorAdmissionEventResult {
  try {
    const policy = input.policy;

    if (!policy ||
        policy.enabled !== true ||
        policy.ownerActivated !== true ||
        typeof input.selectedEventId !== "string" ||
        input.selectedEventId !== policy.eventId ||
        !validTime(input.nowMs) ||
        !validTime(policy.opensAtMs) ||
        !validTime(policy.closesAtMs) ||
        policy.opensAtMs >= policy.closesAtMs ||
        input.nowMs < policy.opensAtMs ||
        input.nowMs >= policy.closesAtMs) {
      return denied();
    }

    // Permanent registration currently resolves events
    // against the server's Eastern calendar date.
    if (easternDate(input.nowMs) !== policy.date ||
        easternDate(policy.opensAtMs) !== policy.date ||
        easternDate(policy.closesAtMs - 1) !== policy.date) {
      return denied();
    }

    // Public admission must not inherit the general-visit
    // fallback used by ordinary attendance registration.
    const matching = input.approvedEvents.filter(event =>
      event.active === true &&
      event.id === policy.eventId &&
      event.date === policy.date
    );

    if (matching.length !== 1) {
      return denied();
    }

    const resolved = resolveVisitorEventContext({
      date: policy.date,
      selectedEventId: policy.eventId,
      approvedEvents: input.approvedEvents
    });

    if (resolved.status !== "resolved" ||
        resolved.serviceId !== policy.eventId) {
      return denied();
    }

    return {
      admitted: true,
      serviceId: resolved.serviceId,
      date: policy.date,
      opensAtMs: policy.opensAtMs,
      closesAtMs: policy.closesAtMs
    };
  } catch {
    return denied();
  }
}
