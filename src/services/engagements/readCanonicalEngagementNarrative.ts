import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../integration/integrationService";
import { TIMELINE_DERIVATION_LIMIT } from "../integration/timelineConstants";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "./engagementsService";
import { readEngagementRiskV1 } from "./readEngagementRisk";
import type { CanonicalEngagementNarrative } from "../narratives/canonicalNarrativeContracts";

export async function readCanonicalEngagementNarrative(visitorId: string): Promise<CanonicalEngagementNarrative> {
  const engagementEventsRepo = new EngagementEventsRepository();
  const engagementSummaryRepo = new EngagementSummaryRepository();
  const engagementsService = new EngagementsService(engagementEventsRepo);
  const integrationService = new IntegrationService(new EngagementEventsRepository());

  const [summary, status, risk, timelinePage] = await Promise.all([
    engagementSummaryRepo.get(visitorId),
    engagementsService.getCurrentStatus(visitorId),
    readEngagementRiskV1(engagementsService, visitorId, 14),
    integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT)
  ]);

  const timelinePreview = Array.isArray(timelinePage?.items)
    ? timelinePage.items
    : [];

  return {
    summary: summary ?? null,
    status: status?.status ?? null,
    lastChangedAt: status?.lastChangedAt ?? null,
    lastEventId: status?.lastEventId ?? null,
    risk,
    timelinePreview
  };
}
