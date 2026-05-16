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