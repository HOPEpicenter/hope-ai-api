import type { CareEvent } from "../../contracts/careEvent.v1";
import type { IntelligenceSignalEmitted } from "../../contracts/intelligenceSignal.v1";

function createSignal(
  event: CareEvent,
  signalType: string,
  severity: IntelligenceSignalEmitted["payload"]["severity"],
  metadata: Record<string, unknown>
): IntelligenceSignalEmitted {
  return {
    signalId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    sourceDomain: "care",
    memberId: event.memberId,
    careCaseId: event.careCaseId,
    type: "IntelligenceSignalEmitted",
    payload: {
      signalType,
      severity,
      metadata,
    },
  };
}

export function mapCareEventToIntelligenceSignal(
  event: CareEvent
): IntelligenceSignalEmitted | null {
  switch (event.type) {
    case "CareCaseOpened":
      return createSignal(
        event,
        "CARE_CASE_OPENED",
        event.payload.priority,
        { category: event.payload.category }
      );
    case "CareCaseFollowUpStalledDetected":
      return createSignal(event, "CARE_CASE_STALLED", "high", {
        stalledSince: event.payload.stalledSince,
      });
    case "CareOutcomeRecorded":
      return createSignal(
        event,
        "CARE_CASE_CLOSED_WITH_OUTCOME",
        event.payload.severity,
        {
          outcomeType: event.payload.outcomeType,
          notes: event.payload.notes ?? null,
        }
      );
    case "CareCaseClosed":
      return createSignal(event, "CARE_CASE_CLOSED", "info", {
        reason: event.payload.reason ?? null,
      });
    default:
      return null;
  }
}