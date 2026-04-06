export type JourneyStep =
  | "NEW"
  | "ENGAGED"
  | "FORMING"
  | "COMMITTED";

export interface JourneyEvidence {
  source: "engagement" | "formation";
  eventType: string;
  at: string;
  summary?: string;
}

export interface JourneySummary {
  currentStep: JourneyStep;
  updatedAt: string | null;
  sources: string[];
  evidence: JourneyEvidence[];
}

export function deriveJourneySummaryV1(input: {
  engagementEvents: any[];
  formationProfile: any | null;
}): JourneySummary {
  const evidence: JourneyEvidence[] = [];

  // --- engagement evidence ---
  if (input.engagementEvents?.length > 0) {
    const latest = input.engagementEvents[0];

    evidence.push({
      source: "engagement",
      eventType: latest.eventType || "UNKNOWN",
      at: latest.happenedAt || latest.recordedAt || null,
      summary: latest.summary
    });
  }

  // --- formation evidence ---
  if (input.formationProfile?.lastEventType) {
    evidence.push({
      source: "formation",
      eventType: input.formationProfile.lastEventType,
      at: input.formationProfile.lastEventAt,
      summary: input.formationProfile.lastEventType
    });
  }

  // --- derive step ---
  let currentStep: JourneyStep = "NEW";

  const formationType = input.formationProfile?.lastEventType;

  if (formationType === "MEMBERSHIP_RECORDED") {
    currentStep = "COMMITTED";
  } else if (
    formationType === "SALVATION_RECORDED" ||
    formationType === "BAPTISM_RECORDED"
  ) {
    currentStep = "FORMING";
  } else if (input.engagementEvents?.length > 0) {
    currentStep = "ENGAGED";
  }

  // --- updatedAt ---
  const timestamps = evidence
    .map(e => e.at)
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    currentStep,
    updatedAt: timestamps[0] || null,
    sources: [...new Set(evidence.map(e => e.source))],
    evidence
  };
}


