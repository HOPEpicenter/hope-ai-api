import { Router } from "express";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { readEngagementRiskV1 } from "../../services/engagements/readEngagementRisk";

export const engagementsRiskRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

// GET /api/engagements/risk?visitorId=...&windowDays=14
engagementsRiskRouter.get("/engagements/risk", async (req, res, next) => {
  try {
    const visitorId = String(req.query.visitorId ?? "");
    const windowDays = Number(req.query.windowDays ?? 14);

    if (!visitorId || visitorId.length < 8) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "visitorId must be a string (min 8 chars)"
        }
      });
    }

    const risk = await readEngagementRiskV1(service, visitorId, windowDays);
    return res.status(200).json(risk);
  } catch (err) {
    return next(err);
  }
});
