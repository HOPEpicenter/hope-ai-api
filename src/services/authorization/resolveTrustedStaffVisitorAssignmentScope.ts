/**
 * Resolves formation follow-up assignment scope from a trusted, complete
 * snapshot of canonical formation events.
 *
 * Callers must establish verified staff identity and ensure that event
 * evidence is complete and authoritative. Do not supply client events,
 * display projections, or partial event-history pages.
 *
 * This module performs no storage reads or HTTP authorization.
 */

export type TrustedFormationAssignmentEvent = {
  visitorId: string;
  type: string;
  occurredAt: string;
  eventId: string;
  data?: {
    assigneeId?: unknown;
  };
};

export type TrustedFormationAssignmentEvidence = {
  complete: boolean;
  events: readonly TrustedFormationAssignmentEvent[];
};

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  // Persisted formation events use normalized UTC millisecond timestamps.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value
    ? parsed
    : null;
}

/**
 * Returns the visitor IDs currently assigned to a previously verified
 * canonical staff identity. Any ambiguity for a visitor denies that visitor.
 */
export function resolveTrustedStaffVisitorAssignmentScope(
  verifiedStaffId: string,
  evidence: TrustedFormationAssignmentEvidence
): string[] {
  if (
    !validId(verifiedStaffId) ||
    !evidence ||
    evidence.complete !== true ||
    !Array.isArray(evidence.events)
  ) {
    return [];
  }

  type Assignment = {
    at: number;
    eventId: string;
    owner: string | null;
    invalid: boolean;
  };

  const byVisitor = new Map<string, Assignment[]>();
  const invalidVisitors = new Set<string>();

  for (const event of evidence.events) {
    if (!event || !validId(event.visitorId)) {
      return [];
    }

    if (
      event.type !== "FOLLOWUP_ASSIGNED" &&
      event.type !== "FOLLOWUP_UNASSIGNED"
    ) {
      continue;
    }

    const at = timestamp(event.occurredAt);

    if (at === null || !validId(event.eventId)) {
      invalidVisitors.add(event.visitorId);
      continue;
    }

    let owner: string | null = null;
    let invalid = false;

    if (event.type === "FOLLOWUP_ASSIGNED") {
      if (!validId(event.data?.assigneeId)) {
        invalid = true;
      } else {
        owner = event.data.assigneeId;
      }
    }

    const records = byVisitor.get(event.visitorId) ?? [];

    records.push({
      at,
      eventId: event.eventId,
      owner,
      invalid
    });

    byVisitor.set(event.visitorId, records);
  }

  const result: string[] = [];

  for (const [visitorId, records] of byVisitor) {
    if (invalidVisitors.has(visitorId) || records.some(r => r.invalid)) {
      continue;
    }

    const eventIds = new Set<string>();

    if (records.some(record => {
      if (eventIds.has(record.eventId)) return true;
      eventIds.add(record.eventId);
      return false;
    })) {
      continue;
    }

    const newest = Math.max(...records.map(record => record.at));
    const latest = records.filter(record => record.at === newest);

    // Timestamp collisions are ambiguous, regardless of event-ID ordering.
    if (latest.length !== 1) {
      continue;
    }

    if (latest[0].owner === verifiedStaffId) {
      result.push(visitorId);
    }
  }

  return result.sort();
}
