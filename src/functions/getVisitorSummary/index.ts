import { requireApiKeyForFunction } from "../_shared/apiKey";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { readCanonicalEngagementNarrative } from "../../services/engagements/readCanonicalEngagementNarrative";
import { getFormationProfilesTableClient, getFormationProfileByVisitorId } from "../_shared/formation";
import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { projectFollowupState } from "../_shared/followupProjection";

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
      engagement,
      integrationSummary,
      formationProfile
    ] = await Promise.all([
      readCanonicalEngagementNarrative(visitorId),
      integrationService.readIntegrationSummary(visitorId),
      getFormationProfileByVisitorId(table, visitorId)
    ]);

    const safeTimelineItems = Array.isArray(engagement?.timelinePreview)
      ? engagement.timelinePreview
      : [];

    const journey = deriveJourneySummaryV1({
      engagementEvents: safeTimelineItems,
      formationProfile: formationProfile ?? null
    });

    const followupProjection =
      formationProfile
        ? projectFollowupState(formationProfile)
        : null;

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement,
          integration: integrationSummary ?? null,
          formation: {
            profile: formationProfile
              ? {
                  ...formationProfile,
                  followupStatus: followupProjection?.followupState ?? null,
                  attentionState: followupProjection?.attentionState ?? null
                }
              : null,
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

