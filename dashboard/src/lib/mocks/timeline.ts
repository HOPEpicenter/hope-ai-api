import type { TimelineResponse } from "@/lib/contracts/timeline";

export const mockTimeline: TimelineResponse = {
  ok: true,
  items: [
    {
      eventId: "evt-3003",
      occurredAt: "2026-03-07T15:40:00.000Z",
      stream: "formation",
      type: "NEXT_STEP_SELECTED",
      summary: "Visitor selected a next step."
    },
    {
      eventId: "evt-3002",
      occurredAt: "2026-03-07T11:55:00.000Z",
      stream: "formation",
      type: "FOLLOWUP_ASSIGNED",
      summary: "Followup assigned to ops-user-1."
    },
    {
      eventId: "evt-3001",
      occurredAt: "2026-03-06T18:10:00.000Z",
      stream: "engagement",
      type: "status.transition",
      summary: "Visitor moved to engaged."
    }
  ],
  nextCursor: null
};
