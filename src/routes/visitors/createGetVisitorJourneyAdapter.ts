import type { NextFunction, Request, Response } from "express";
import { readCanonicalJourneyNarrative } from "../../services/journey/readCanonicalJourneyNarrative";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";

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

      const journey = await readCanonicalJourneyNarrative(
        visitorId,
        async (id) => getFormationProfile(profilesTable as any, id)
      );

      return res.status(200).json({
        ok: true,
        visitorId,
        ...journey
      });
    } catch (err) {
      return next(err);
    }
  };
}



