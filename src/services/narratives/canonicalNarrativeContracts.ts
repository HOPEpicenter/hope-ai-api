export type ReadFormationProfile = (visitorId: string) => Promise<any | null>;

export type CanonicalJourneyNarrative = {
  currentStep?: string;
  updatedAt?: string | null;
  sources: string[];
  evidence?: any[];
  [key: string]: any;
};

export type CanonicalVisitorNarrative = {
  engagement: any;
  integration: any | null;
  formation: any;
  journey: any;
};