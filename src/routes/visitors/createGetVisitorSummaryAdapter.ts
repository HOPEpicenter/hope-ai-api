import type { Request, Response, NextFunction } from "express";
import { readCanonicalVisitorSummary } from "../../services/visitors/readCanonicalVisitorSummary";

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

      const summary = await readCanonicalVisitorSummary(visitorId);

      return res.status(200).json(summary);
    } catch (err) {
      return next(err);
    }
  };
}

