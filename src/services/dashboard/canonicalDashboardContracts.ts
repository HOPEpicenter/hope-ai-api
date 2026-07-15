import type { CanonicalVisitorNarrative } from "../narratives/canonicalNarrativeContracts";
import type { CanonicalUnifiedVisitorStory } from "../narratives/canonicalOperationalNarrativeContracts";
import type { CanonicalVisitorIdentity } from "./visitorIdentity";
export type CanonicalVisitorDashboardCard = {
  visitorId: string;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  stage: string | null;
  stageReason: string | null;
  stageUpdatedAt: string | null;
  stageUpdatedBy: string | null;
  lastNextStepAt: string | null;
  lastNextStepCompletedAt: string | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupOutcome: string | null;
  lastFollowupOutcomeAt: string | null;
  lastPrayerRequestedAt: string | null;
  followupStatus: "action_needed" | "contact_made" | "resolved" | "unassigned";
  assignedTo: string | null;
  assignedToName: string | null;
  attentionState: "needs_attention" | "clear";
  followupUrgency: "OVERDUE" | "AT_RISK" | "ON_TRACK" | null;
  followupOverdue: boolean;
  riskLevel: string | null;
  riskScore: number | null;
  needsFollowup: boolean | null;
  recommendedAction: string | null;
  priorityBand: "urgent" | "high" | "normal" | "low";
  priorityScore: number;
  priorityReason: string;
};

export type CanonicalVisitorSnapshotIdentity = CanonicalVisitorIdentity;

export type CanonicalVisitorSnapshot = {
  visitorId: string;
  identity: CanonicalVisitorSnapshotIdentity;
  dashboardCard: CanonicalVisitorDashboardCard;
  narrative: CanonicalVisitorNarrative;
  unifiedStory: CanonicalUnifiedVisitorStory;
};

