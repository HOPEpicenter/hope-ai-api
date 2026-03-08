import { FollowupsResponse } from "@/lib/contracts/followups";

export const mockFollowups: FollowupsResponse = {
  ok: true,
  items: [
    {
      visitorId: "visitor-1001",
      name: "Jane Visitor",
      status: "OPEN",
      assignedTo: "ops-user-1",
      followupReason: "no_engagement_yet",
      updatedAt: "2026-03-07T12:00:00.000Z"
    },
    {
      visitorId: "visitor-1002",
      name: "John Visitor",
      status: "OPEN",
      assignedTo: null,
      followupReason: "stale_engagement",
      updatedAt: "2026-03-07T11:30:00.000Z"
    }
  ]
};
