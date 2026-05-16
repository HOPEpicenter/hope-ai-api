import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { readCanonicalEngagementNarrative } from "../engagements/readCanonicalEngagementNarrative";
import { buildCanonicalFormationNarrative } from "../formation/readCanonicalFormationNarrative";
import { IntegrationService } from "../integration/integrationService";

const integrationService = new IntegrationService(new EngagementEventsRepository());

type ReadFormationProfile = (visitorId: string) => Promise<any | null>;

export async function readCanonicalVisitorNarrative(
  visitorId: string,
  readFormationProfile: ReadFormationProfile
) {
  const [
    engagement,
    integrationSummary,
    formationProfile
  ] = await Promise.all([
    readCanonicalEngagementNarrative(visitorId),
    integrationService.readIntegrationSummary(visitorId),
    readFormationProfile(visitorId)
  ]);

  const safeTimelineItems = Array.isArray(engagement?.timelinePreview)
    ? engagement.timelinePreview
    : [];

  const journey = deriveJourneySummaryV1({
    engagementEvents: safeTimelineItems,
    formationProfile: formationProfile ?? null
  });

  const formation = buildCanonicalFormationNarrative(formationProfile ?? null);

  return {
    engagement,
    integration: integrationSummary ?? null,
    formation,
    journey
  };
}