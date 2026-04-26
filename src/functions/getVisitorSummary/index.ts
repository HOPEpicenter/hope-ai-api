import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { TIMELINE_DERIVATION_LIMIT } from "../../services/integration/timelineConstants";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { readEngagementRiskV1 } from "../../services/engagements/readEngagementRisk";
import { getFormationProfilesTableClient, getFormationProfileByVisitorId } from "../_shared/formation";
import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";

const engagementSummaryRepo = new EngagementSummaryRepository();
const engagementEventsRepo = new EngagementEventsRepository();
const engagementsService = new EngagementsService(engagementEventsRepo);
const integrationService = new IntegrationService(new EngagementEventsRepository());

export async function getVisitorSummary(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const visitorId = String(req?.params?.id ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const table = getFormationProfilesTableClient();

    const [
      engagementSummary,
      engagementStatus,
      engagementRisk,
      integrationSummary,
      timelinePage,
      formationProfile
    ] = await Promise.all([
      engagementSummaryRepo.get(visitorId),
      engagementsService.getCurrentStatus(visitorId),
      readEngagementRiskV1(engagementsService, visitorId, 14),
      integrationService.readIntegrationSummary(visitorId),
      integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT),
      getFormationProfileByVisitorId(table, visitorId)
    ]);

    const safeTimelineItems = Array.isArray(timelinePage?.items)
      ? timelinePage.items
      : [];

    const journey = deriveJourneySummaryV1({
      engagementEvents: safeTimelineItems,
      formationProfile: formationProfile ?? null
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement: {
            summary: engagementSummary ?? null,
            status: engagementStatus?.status ?? null,
            lastChangedAt: engagementStatus?.lastChangedAt ?? null,
            lastEventId: engagementStatus?.lastEventId ?? null,
            risk: engagementRisk,
            timelinePreview: safeTimelineItems
          },
          integration: integrationSummary ?? null,
          formation: {
            profile: formationProfile ?? null,
            milestones: {
              hasSalvation: formationProfile?.lastEventType === "SALVATION_RECORDED",
              hasBaptism: formationProfile?.lastEventType === "BAPTISM_RECORDED",
              hasMembership: formationProfile?.lastEventType === "MEMBERSHIP_RECORDED"
            }
          },
          journey
        }
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}


