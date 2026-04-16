import type { NextFunction, Request, Response } from "express";
import { deriveJourneySummaryV1 } from "../../lib/journey/deriveJourneySummaryV1";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";

const integrationService = new IntegrationService(new EngagementEventsRepository());

export function createGetVisitorJourneyAdapter() {
  return async function getVisitorJourney(req: Request, res: Response, next: NextFunction) {
    try {
      const visitorIdRaw = req.params.id;
      const visitorId = Array.isArray(visitorIdRaw) ? visitorIdRaw[0] : visitorIdRaw;

      if (!visitorId || typeof visitorId !== "string") {
        return res.status(400).json({
          ok: false,
          error: "visitorId is required"
        });
      }

      const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
      if (!storageConnectionString) {
        return res.status(500).json({ ok: false, error: "Missing STORAGE_CONNECTION_STRING" });
      }

      const profilesTable = getFormationProfilesTableClient(storageConnectionString);

      let engagementEvents: any[] = [];

      try {
        const timelinePage = await integrationService.readIntegratedTimeline(visitorId, 5);
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

      const formationProfile = await getFormationProfile(profilesTable as any, visitorId);

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

      return res.status(200).json({
        ok: true,
        visitorId,
        ...journey,
        sources
      });
    } catch (err) {
      return next(err);
    }
  };
}

