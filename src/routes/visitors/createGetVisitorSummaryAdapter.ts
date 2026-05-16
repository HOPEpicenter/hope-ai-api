import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import type { Request, Response, NextFunction } from "express";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { TIMELINE_DERIVATION_LIMIT } from "../../services/integration/timelineConstants";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { readEngagementRiskV1 } from "../../services/engagements/readEngagementRisk";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { projectFollowupState } from "../../functions/_shared/followupProjection";

const engagementSummaryRepo = new EngagementSummaryRepository();
const integrationService = new IntegrationService(new EngagementEventsRepository());
const engagementsService = new EngagementsService(new EngagementEventsRepository());

export function createGetVisitorSummaryAdapter() {
  return async function getVisitorSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const visitorIdRaw = req.params.id;
      const visitorId = Array.isArray(visitorIdRaw) ? visitorIdRaw[0] : visitorIdRaw;

      if (!visitorId || typeof visitorId !== "string") {
        return res.status(400).json({
          ok: false,
          error: "visitorId is required",
        });
      }

      const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
      if (!storageConnectionString) {
        return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
      }

      const profilesTable = getFormationProfilesTableClient(storageConnectionString);

      const [engagementSummary, engagementStatus, engagementRisk, integrationSummary, timelinePage, formationProfile] = await Promise.all([
        engagementSummaryRepo.get(visitorId),
        engagementsService.getCurrentStatus(visitorId),
        readEngagementRiskV1(engagementsService, visitorId, 14),
        integrationService.readIntegrationSummary(visitorId),
        integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT),
        getFormationProfile(profilesTable as any, visitorId)
      ]);

      const journey = deriveJourneySummaryV1({
        engagementEvents: timelinePage?.items ?? [],
        formationProfile: formationProfile ?? null
      });

      const followupProjection = formationProfile
        ? projectFollowupState(formationProfile)
        : null;

      const canonicalFormationProfile = formationProfile
        ? {
            ...formationProfile,
            followupStatus: followupProjection?.followupState ?? "none",
            attentionState: followupProjection?.attentionState ?? "clear",
            projectionMetadata: followupProjection?.projectionMetadata ?? null
          }
        : null;

      return res.status(200).json({
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
            timelinePreview: timelinePage?.items ?? []
          },
          integration: integrationSummary ?? null,
          formation: {
            profile: canonicalFormationProfile,
            milestones: {
              hasSalvation: formationProfile?.lastEventType === "SALVATION_RECORDED",
              hasBaptism: formationProfile?.lastEventType === "BAPTISM_RECORDED",
              hasMembership: formationProfile?.lastEventType === "MEMBERSHIP_RECORDED"
            }
          },
          journey
        },
      });
    } catch (err) {
      return next(err);
    }
  };
}

