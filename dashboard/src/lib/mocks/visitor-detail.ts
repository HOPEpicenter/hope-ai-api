import type { VisitorDetailResponse } from "@/lib/contracts/visitor-detail";

const mockById: Record<string, VisitorDetailResponse> = {
  "visitor-1002": {
    ok: true,
    journey: {
      currentStep: "NEW",
      updatedAt: null,
      sources: [],
      evidence: []
    },
    engagementTimeline: [],
    visitor: {
      visitorId: "visitor-1002",
      name: "John Visitor",
      email: "john.visitor@example.com",
      createdAt: "2026-03-06T13:15:00.000Z",
      updatedAt: "2026-03-07T15:45:00.000Z"
    },
    formationEvents: [],
    formationProfile: {
      partitionKey: "VISITOR",
      rowKey: "visitor-1002",
      stage: "Connected",
      assignedTo: { ownerId: "ops-user-2" },
      lastFollowupAssignedAt: "2026-03-07T15:10:00.000Z",
      lastFollowupContactedAt: "2026-03-07T15:45:00.000Z",
      lastFollowupOutcomeAt: null,
      lastFollowupOutcome: null,
      lastFollowupOutcomeNotes: null,
      lastEventType: "SALVATION_RECORDED",
      lastEventAt: "2026-03-07T15:40:00.000Z",
      updatedAt: "2026-03-07T15:40:01.000Z"
    },
    formationMilestones: {
      hasSalvation: true,
      hasBaptism: false,
      hasMembership: false
    }
  },
  "visitor-1001": {
    ok: true,
    journey: {
      currentStep: "NEW",
      updatedAt: null,
      sources: [],
      evidence: []
    },
    engagementTimeline: [],
    visitor: {
      visitorId: "visitor-1001",
      name: "Jane Visitor",
      email: "jane.visitor@example.com",
      createdAt: "2026-03-05T10:30:00.000Z",
      updatedAt: "2026-03-07T12:00:00.000Z"
    },
    formationEvents: [],
    formationProfile: {
      partitionKey: "VISITOR",
      rowKey: "visitor-1001",
      stage: "Connected",
      assignedTo: { ownerId: "ops-user-1" },
      lastFollowupAssignedAt: "2026-03-07T11:55:00.000Z",
      lastFollowupContactedAt: null,
      lastFollowupOutcomeAt: null,
      lastFollowupOutcome: null,
      lastFollowupOutcomeNotes: null,
      lastEventType: "FOLLOWUP_ASSIGNED",
      lastEventAt: "2026-03-07T11:55:00.000Z",
      updatedAt: "2026-03-07T11:55:01.000Z"
    },
    formationMilestones: {
      hasSalvation: false,
      hasBaptism: false,
      hasMembership: false
    }
  }
};

export function getMockVisitorDetail(visitorId: string): VisitorDetailResponse {
  return (
    mockById[visitorId] ?? {
      ok: true,
    journey: {
      currentStep: "NEW",
      updatedAt: null,
      sources: [],
      evidence: []
    },
      engagementTimeline: [],
      visitor: {
        visitorId,
        name: "Unknown Visitor",
        email: null,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z"
      },
      formationEvents: [],
      formationProfile: null,
      formationMilestones: {
        hasSalvation: false,
        hasBaptism: false,
        hasMembership: false
      }
    }
  );
}

