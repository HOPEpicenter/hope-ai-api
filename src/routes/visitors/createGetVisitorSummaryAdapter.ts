import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import type { Request, Response, NextFunction } from "express";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";

const engagementSummaryRepo = new EngagementSummaryRepository();

const integrationService = new IntegrationService(new EngagementEventsRepository());

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

      const [engagementSummary, integrationSummary, timelinePage, formationProfile] = await Promise.all([
        engagementSummaryRepo.get(visitorId),
        integrationService.readIntegrationSummary(visitorId),
        integrationService.readIntegratedTimeline(visitorId, 5),
        getFormationProfile(profilesTable as any, visitorId)
      ]);

      const journey = deriveJourneySummaryV1({
        engagementEvents: timelinePage?.items ?? [],
        formationProfile: formationProfile ?? null
      });

      const followupStatus =
        formationProfile?.lastFollowupOutcomeAt
          ? "resolved"
          : formationProfile?.lastFollowupContactedAt
            ? "contacted"
            : formationProfile?.lastFollowupAssignedAt
              ? "assigned"
              : "none";

      const attentionState =
        followupStatus === "none" || followupStatus === "assigned"
          ? "needs_attention"
          : "clear";

      const canonicalFormationProfile = formationProfile
        ? {
            ...formationProfile,
            followupStatus,
            attentionState
          }
        : null;

      return res.status(200).json({
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement: {
            summary: engagementSummary ?? null,
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
          journey: journey
        },
      });
    } catch (err) {
      return next(err);
    }
  };
}

