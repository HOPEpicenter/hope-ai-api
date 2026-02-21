import { Router } from "express";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { validateEngagementScoreQueryV1, EngagementScoreV1 } from "../../contracts/engagementScore.v1";
import { computeEngagementScoreV1 } from "../../domain/engagement/computeEngagementScore.v1";

export const engagementsScoreRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

// GET /api/engagements/score?visitorId=...&windowDays=14
engagementsScoreRouter.get("/engagements/score", async (req, res, next) => {
  try {
    const parsed = validateEngagementScoreQueryV1(req.query);
    if (!parsed.ok) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Query validation failed",
          details: parsed.issues,
        },
      });
    }

    const { visitorId, windowDays } = parsed.value;

    // Bounded/predictable scan (same pattern as analytics)
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

    const summary = computeEngagementScoreV1({ events: all as any, windowDays });

    const result: EngagementScoreV1 = {
      v: 1,
      visitorId,
      windowDays,

      engaged: summary.engaged,
      lastEngagedAt: summary.lastEngagedAt,
      daysSinceLastEngagement: summary.daysSinceLastEngagement,
      engagementCount: summary.engagementCount,

      score: summary.score,
      scoreReasons: summary.scoreReasons,
      needsFollowup: summary.needsFollowup,
    };

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});
