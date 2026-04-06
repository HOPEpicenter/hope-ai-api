import type { TimelineItem } from "@/lib/contracts/timeline";

export type VisitorDetailResponse = {
  journey: {
    currentStep: string;
    updatedAt: string | null;
    sources: string[];
    evidence: Array<{
      source: string;
      eventType: string;
      at: string | null;
      summary?: string | null;
    }>;
  } | null;
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
    partitionKey?: string | null;
    rowKey?: string | null;
    stage?: string | null;
    assignedTo?: { ownerId: string | null } | null;
    lastFollowupAssignedAt?: string | null;
    lastFollowupContactedAt?: string | null;
    lastFollowupOutcomeAt?: string | null;
    lastFollowupOutcome?: string | null;
    lastFollowupOutcomeNotes?: string | null;
    lastEventType?: string | null;
    lastEventAt: string | null;
    updatedAt: string | null;
  } | null;
  formationMilestones: {
    hasSalvation: boolean;
    hasBaptism: boolean;
    hasMembership: boolean;
  };
  formationEvents: Array<{
    eventId: string;
    eventType: string;
    happenedAt: string | null;
    source: string | null;
    notes: string | null;
  }>;
};
