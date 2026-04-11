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
    followupStatus?: "none" | "assigned" | "contacted" | "resolved";
    attentionState?: "needs_attention" | "clear";
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
  dashboardCard?: {
    visitorId: string;
    name?: string | null;
    email?: string | null;
    lastActivityAt?: string | null;
    lastActivitySummary?: string | null;
    followupStatus?: "none" | "pending" | "assigned" | "contacted" | "resolved";
    assignedTo?: string | null;
    attentionState?: "needs_attention" | "clear";
    followupUrgency?: "ON_TRACK" | "AT_RISK" | "OVERDUE" | null;
    followupOverdue?: boolean;
    tags?: string[];
  } | null;
};

