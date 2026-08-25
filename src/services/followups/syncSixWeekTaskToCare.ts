import type {
  SixWeekCareOutcome,
  SixWeekFollowupEvent
} from "../../domain/followups/projectSixWeekVisitorFollowup";
import { recordFormationEventV1 } from "../../functions/_shared/formation";
import { resolveMutationSource } from "../events/resolveMutationSource";

export type SixWeekCareEventRecorder = (body: unknown) => Promise<unknown>;

export type SixWeekCareSyncDependencies = {
  recordCareEvent?: SixWeekCareEventRecorder;
};

export type SixWeekCareSyncResult = {
  contactRecorded: boolean;
  outcomeRecorded: boolean;
  outcomeRequired: boolean;
};

const CARE_OUTCOMES = new Set<SixWeekCareOutcome>([
  "connected",
  "closed"
]);

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function isSixWeekCareOutcome(
  value: unknown
): value is SixWeekCareOutcome {
  return CARE_OUTCOMES.has(
    normalizeText(value).toLowerCase() as SixWeekCareOutcome
  );
}

function narrativeFor(event: SixWeekFollowupEvent): string {
  return [event.data.outcome, event.data.notes]
    .map(normalizeText)
    .filter(Boolean)
    .join("\n\n");
}

export async function syncSixWeekTaskToCare(
  event: SixWeekFollowupEvent,
  dependencies: SixWeekCareSyncDependencies = {}
): Promise<SixWeekCareSyncResult> {
  if (
    event.type !== "six_week_followup.task_completed" ||
    event.data.contactMethod === "none"
  ) {
    return {
      contactRecorded: false,
      outcomeRecorded: false,
      outcomeRequired: false
    };
  }

  const weekNumber = Number(event.data.weekNumber);
  const recordCareEvent =
    dependencies.recordCareEvent ?? recordFormationEventV1;
  const source = resolveMutationSource({
    system: "six_week_followup",
    actorId: event.actorId
  });

  await recordCareEvent({
    v: 1,
    eventId: `${event.eventId}:care-contact`,
    visitorId: event.visitorId,
    type: "FOLLOWUP_CONTACTED",
    occurredAt: event.occurredAt,
    source,
    data: {
      method: event.data.contactMethod,
      result: event.data.outcome,
      notes: event.data.notes ?? null,
      sixWeekWeekNumber: weekNumber,
      sixWeekEventId: event.eventId
    }
  });

  const careOutcome = isSixWeekCareOutcome(event.data.careOutcome)
    ? event.data.careOutcome
    : null;

  if (weekNumber !== 6 || !careOutcome) {
    return {
      contactRecorded: true,
      outcomeRecorded: false,
      outcomeRequired: weekNumber === 6
    };
  }

  await recordCareEvent({
    v: 1,
    eventId: `${event.eventId}:care-outcome`,
    visitorId: event.visitorId,
    type: "FOLLOWUP_OUTCOME_RECORDED",
    occurredAt: event.occurredAt,
    source,
    data: {
      outcome: careOutcome,
      notes: narrativeFor(event),
      sixWeekWeekNumber: weekNumber,
      sixWeekEventId: event.eventId
    }
  });

  return {
    contactRecorded: true,
    outcomeRecorded: true,
    outcomeRequired: false
  };
}
