import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { readCanonicalEngagementNarrative } from "../engagements/readCanonicalEngagementNarrative";
import { buildCanonicalFormationNarrative } from "../formation/readCanonicalFormationNarrative";
import { IntegrationService } from "../integration/integrationService";
import type { CanonicalVisitorNarrative, ReadFormationProfile } from "../narratives/canonicalNarrativeContracts";

const integrationService = new IntegrationService(new EngagementEventsRepository());

export async function readCanonicalVisitorNarrative(
  visitorId: string,
  readFormationProfile: ReadFormationProfile
): Promise<CanonicalVisitorNarrative> {
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