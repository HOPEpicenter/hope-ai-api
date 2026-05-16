import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import type { Request, Response, NextFunction } from "express";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { readCanonicalEngagementNarrative } from "../../services/engagements/readCanonicalEngagementNarrative";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { buildCanonicalFormationNarrative } from "../../services/formation/readCanonicalFormationNarrative";

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

      const [engagement, integrationSummary, formationProfile] = await Promise.all([
        readCanonicalEngagementNarrative(visitorId),
        integrationService.readIntegrationSummary(visitorId),
        getFormationProfile(profilesTable as any, visitorId)
      ]);

      const journey = deriveJourneySummaryV1({
        engagementEvents: engagement.timelinePreview,
        formationProfile: formationProfile ?? null
      });

      const formation = buildCanonicalFormationNarrative(formationProfile ?? null);

      return res.status(200).json({
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement,
          integration: integrationSummary ?? null,
          formation,
          journey
        },
      });
    } catch (err) {
      return next(err);
    }
  };
}

