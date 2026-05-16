export type ReadFormationProfile = (visitorId: string) => Promise<any | null>;

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
  engagement: unknown;
  integration: unknown | null;
  formation: unknown;
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

export type CanonicalEngagementNarrative = {
  summary: unknown | null;
  status: string | null;
  lastChangedAt: string | null;
  lastEventId: string | null;
  risk: unknown;
  timelinePreview: CanonicalEngagementTimelinePreviewItem[];
};
export type CanonicalFormationProfile = {
  followupStatus?: string | null;
  attentionState?: string | null;
  projectionMetadata?: unknown | null;
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