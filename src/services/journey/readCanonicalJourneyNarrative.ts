import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { IntegrationService } from "../integration/integrationService";
import { TIMELINE_DERIVATION_LIMIT } from "../integration/timelineConstants";

const integrationService = new IntegrationService(new EngagementEventsRepository());

type ReadFormationProfile = (visitorId: string) => Promise<any | null>;

export async function readCanonicalJourneyNarrative(
  visitorId: string,
  readFormationProfile: ReadFormationProfile
) {
  let engagementEvents: any[] = [];

  try {
    const timelinePage = await integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT);
    engagementEvents = Array.isArray(timelinePage?.items) ? timelinePage.items : [];
  } catch {
    engagementEvents = [];
  }

  if (engagementEvents.length === 0) {
    try {
      const repo = new EngagementEventsRepository();
      const timeline = await repo.readTimeline(visitorId, 5);
      engagementEvents = Array.isArray(timeline?.items) ? timeline.items : [];
    } catch {
      engagementEvents = [];
    }
  }

  const formationProfile = await readFormationProfile(visitorId);

  const journey = deriveJourneySummaryV1({
    engagementEvents,
    formationProfile: formationProfile ?? null
  });

  const sources =
    Array.isArray((journey as any).sources) && (journey as any).sources.length > 0
      ? (journey as any).sources
      : [
          ...(engagementEvents.length > 0 ? ["engagement"] : []),
          ...(formationProfile ? ["formation"] : [])
        ];

  return {
    ...journey,
    sources
  };
}