import type { TimelineItem } from "@/lib/contracts/timeline";

export type VisitorDetailResponse = {
  engagementTimeline: TimelineItem[];
  ok: boolean;
  visitor: {
    visitorId: string;
    name: string;
    email: string | null;
    createdAt: string;
    updatedAt: string;
  };
  formationProfile: {
    partitionKey: string;
    rowKey: string;
    stage: string | null;
    assignedTo: {
      ownerId: string | null;
    } | null;
    lastFollowupAssignedAt: string | null;
    lastFollowupContactedAt: string | null;
    lastFollowupOutcomeAt: string | null;
    lastFollowupOutcome: string | null;
    lastFollowupOutcomeNotes: string | null;
    lastEventType: string | null;
    lastEventAt: string | null;
    updatedAt: string | null;
  } | null;
  formationEvents: Array<{
    eventId: string;
    eventType: string;
    happenedAt: string | null;
    source: string | null;
    notes: string | null;
  }>;
};

