export type ReadFormationProfile = (visitorId: string) => Promise<any | null>;

export type CanonicalEngagementRiskLevel = "low" | "medium" | "high" | "unknown" | string;

export type CanonicalFollowupState =
  | "none"
  | "needed"
  | "assigned"
  | "contacted"
  | "completed"
  | "closed"
  | string;

export type CanonicalAttentionState =
  | "none"
  | "watch"
  | "needs_attention"
  | "urgent"
  | string;

export type CanonicalProjectionMetadata = {
  projectedAt?: string;
  reason?: string;
  [key: string]: unknown;
};

export type CanonicalJourneySource = "engagement" | "formation" | string;

export type CanonicalNarrativeEvidence = {
  source?: CanonicalJourneySource;
  eventType?: string;
  at?: string | null;
  summary?: string;};

export type CanonicalJourneyNarrative = {
  currentStep?: string;
  updatedAt?: string | null;
  sources: CanonicalJourneySource[];
  evidence?: CanonicalNarrativeEvidence[];};

export type CanonicalVisitorNarrative = {
  engagement: CanonicalEngagementNarrative;
  integration: unknown | null;
  formation: CanonicalFormationNarrative;
  journey: CanonicalJourneyNarrative | unknown;
};
export type CanonicalEngagementTimelinePreviewItem = {
  eventId?: string;
  visitorId?: string;
  type?: string;
  occurredAt?: string;
  source?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

export type CanonicalEngagementRisk = {
  riskLevel?: string | null;
  riskScore?: number | null;
  recommendedAction?: string | null;
  engagement?: {
    needsFollowup?: boolean | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type CanonicalEngagementNarrative = {
  summary: unknown | null;
  status: string | null;
  lastChangedAt: string | null;
  lastEventId: string | null;
  risk: CanonicalEngagementRisk | null;
  timelinePreview: CanonicalEngagementTimelinePreviewItem[];
};
export type CanonicalFormationProfile = {
  followupStatus?: CanonicalFollowupState | null;
  attentionState?: CanonicalAttentionState | null;
  projectionMetadata?: CanonicalProjectionMetadata | null;
  lastEventType?: string | null;
  [key: string]: unknown;
};

export type CanonicalFormationMilestones = {
  hasSalvation: boolean;
  hasBaptism: boolean;
  hasMembership: boolean;
};

export type CanonicalFormationNarrative = {
  profile: CanonicalFormationProfile | null;
  milestones: CanonicalFormationMilestones;
};