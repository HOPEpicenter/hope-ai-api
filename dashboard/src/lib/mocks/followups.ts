import type { FollowupsResponse } from "@/lib/contracts/followups";

export const mockFollowups: FollowupsResponse = {
  ok: true,
  items: [
    {
      visitorId: "visitor-1001",
      assignedTo: { ownerType: "user", ownerId: "ops-user-1" },
      lastFollowupAssignedAt: "2026-03-07T16:30:00.000Z",
      lastFollowupContactedAt: null,
      lastFollowupOutcomeAt: null,
      lastFollowupOutcome: null,
      resolvedForAssignment: false,
      stage: "CONNECTED",
      needsFollowup: true
    },
    {
      visitorId: "visitor-1002",
      assignedTo: { ownerType: "user", ownerId: "ops-user-2" },
      lastFollowupAssignedAt: "2026-03-07T15:10:00.000Z",
      lastFollowupContactedAt: "2026-03-07T15:45:00.000Z",
      lastFollowupOutcomeAt: null,
      lastFollowupOutcome: null,
      resolvedForAssignment: false,
      stage: "NEW",
      needsFollowup: false
    }
  ]
};


