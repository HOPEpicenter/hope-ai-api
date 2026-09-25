import type { CareEvent } from "./care.events";
import type { CareProfile } from "./careProfile.projection";

export type CareTimelineItem = { occurredAt: string; type: CareEvent["type"]; caseId: string; note?: string; ownerId?: string | null; priority?: string; reason?: string; statusChange?: "open" | "stalled" | "closed" };
export type CareTimelineCollection = { memberId: string; items: CareTimelineItem[] };

export function buildCareTimeline(profile: CareProfile, events: readonly CareEvent[]): CareTimelineItem[] {
  return events.filter((event) => event.memberId === profile.memberId).slice().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId)).map((event) => {
    switch (event.type) {
      case "CareCaseStarted": return { occurredAt: event.occurredAt, type: event.type, caseId: event.caseId, ownerId: event.payload.ownerId, priority: event.payload.priority, note: event.payload.note, statusChange: "open" };
      case "CareOwnerAssigned": return { occurredAt: event.occurredAt, type: event.type, caseId: event.caseId, ownerId: event.payload.ownerId };
      case "CareNoteAdded": return { occurredAt: event.occurredAt, type: event.type, caseId: event.caseId, note: event.payload.note, statusChange: "open" };
      case "CareStalledDetected": return { occurredAt: event.occurredAt, type: event.type, caseId: event.caseId, reason: event.payload.reason, statusChange: "stalled" };
      case "CareCaseClosed": return { occurredAt: event.occurredAt, type: event.type, caseId: event.caseId, statusChange: "closed" };
    }
  });
}