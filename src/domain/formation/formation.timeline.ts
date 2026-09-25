import type { FormationEvent } from "../../contracts/formationEvent.v1";
import type { FormationProfile } from "./formationProfile.projection";

export type FormationTimelineItem = {
  occurredAt: string;
  type: FormationEvent["type"];
  pathwayId: string;
  stepId?: string;
  notes?: string;
  reason?: string;
  statusChange?: "in_progress" | "stalled" | "completed";
};

export type FormationTimelineCollection = {
  memberId: string;
  items: FormationTimelineItem[];
};

function toTimelineItem(event: FormationEvent): FormationTimelineItem {
  switch (event.type) {
    case "PathwayStarted":
      return {
        occurredAt: event.occurredAt,
        type: event.type,
        pathwayId: event.pathwayId,
        stepId: event.payload.initialStepId,
        statusChange: "in_progress"
      };
    case "StepCompleted":
      return {
        occurredAt: event.occurredAt,
        type: event.type,
        pathwayId: event.pathwayId,
        stepId: event.payload.stepId,
        notes: event.payload.notes,
        statusChange: "in_progress"
      };
    case "StepStalledDetected":
      return {
        occurredAt: event.occurredAt,
        type: event.type,
        pathwayId: event.pathwayId,
        stepId: event.payload.stepId,
        reason: event.payload.reason,
        statusChange: "stalled"
      };
    case "PathwayCompleted":
      return {
        occurredAt: event.occurredAt,
        type: event.type,
        pathwayId: event.pathwayId,
        stepId: event.payload.finalStepId,
        statusChange: "completed"
      };
  }
}

export function buildFormationTimeline(
  profile: FormationProfile,
  events: readonly FormationEvent[]
): FormationTimelineItem[] {
  return events
    .filter((event) => event.memberId === profile.memberId)
    .slice()
    .sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt)
      || left.eventId.localeCompare(right.eventId)
    )
    .map(toTimelineItem);
}