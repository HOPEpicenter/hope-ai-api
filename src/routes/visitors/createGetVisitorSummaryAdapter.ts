import type { Request, Response, NextFunction } from "express";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { readCanonicalVisitorNarrative } from "../../services/visitors/readCanonicalVisitorNarrative";

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

      const summary = await readCanonicalVisitorNarrative(
        visitorId,
        async (id) => getFormationProfile(profilesTable as any, id)
      );

      return res.status(200).json({
        ok: true,
        v: 1,
        visitorId,
        summary,
      });
    } catch (err) {
      return next(err);
    }
  };
}

