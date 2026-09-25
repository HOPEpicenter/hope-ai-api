import type { CareEvent } from "../../contracts/careEvent.v1";
import type { RaiseAlertCommand } from "./alert.commands";

export function mapCareEventToAlert(
  event: CareEvent
): RaiseAlertCommand | null {
  switch (event.type) {
    case "CareCaseOpened":
      if (event.payload.priority !== "high") {
        return null;
      }

      return {
        alertId: crypto.randomUUID(),
        memberId: event.memberId,
        careCaseId: event.careCaseId,
        signalType: "CARE_CASE_OPENED",
        severity: "high",
        assignedTo: event.actorId ?? "care_leader",
        metadata: { category: event.payload.category },
        actorId: event.actorId ?? null,
      };
    case "CareCaseFollowUpStalledDetected":
      return {
        alertId: crypto.randomUUID(),
        memberId: event.memberId,
        careCaseId: event.careCaseId,
        signalType: "CARE_CASE_STALLED",
        severity: "high",
        assignedTo: "care_leader",
        metadata: { stalledSince: event.payload.stalledSince },
        actorId: event.actorId ?? null,
      };
    case "CareOutcomeRecorded":
      if (event.payload.severity !== "high") {
        return null;
      }

      return {
        alertId: crypto.randomUUID(),
        memberId: event.memberId,
        careCaseId: event.careCaseId,
        signalType: "CARE_CASE_OUTCOME_HIGH",
        severity: "high",
        assignedTo: "pastor",
        metadata: {
          outcomeType: event.payload.outcomeType,
          notes: event.payload.notes ?? null,
        },
        actorId: event.actorId ?? null,
      };
    default:
      return null;
  }
}