import { Router } from "express";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { computeEngagementScoreV1 } from "../../domain/engagement/computeEngagementScore.v1";
import { deriveEngagementRiskV1 } from "../../domain/engagement/deriveEngagementRisk.v1";

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

    const MAX_EVENTS = 2000;
    const PAGE_SIZE = 250;

    const all: any[] = [];
    let cursor: string | undefined = undefined;

    while (all.length < MAX_EVENTS) {
      const page = await service.readTimeline(visitorId, PAGE_SIZE, cursor);
      all.push(...(page.items ?? []));

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const score = computeEngagementScoreV1({
      events: all as any,
      windowDays
    });

    const risk = deriveEngagementRiskV1({
      visitorId,
      windowDays,
      engaged: score.engaged,
      lastEngagedAt: score.lastEngagedAt,
      daysSinceLastEngagement: score.daysSinceLastEngagement,
      engagementCount: score.engagementCount,
      score: score.score,
      scoreReasons: score.scoreReasons,
      needsFollowup: score.needsFollowup
    });

    return res.status(200).json(risk);
  } catch (err) {
    return next(err);
  }
});
