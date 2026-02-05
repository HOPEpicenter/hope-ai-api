import { Router } from "express";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsTimelineRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

engagementsTimelineRouter.get("/engagements/timeline", async (req, res, next) => {
  try {
    const parsed = validateTimelineQueryV1(req.query);

    if (!parsed.ok) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Query validation failed",
          details: parsed.issues.map((i: { path: string; message: string }) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    const { visitorId, limit, cursor } = parsed.value;
    const page = await service.readTimeline(visitorId, limit, cursor);

    return res.status(200).json({
      v: 1,
      visitorId,
      limit,
      nextCursor: page.nextCursor ?? null,
      items: page.items,
    });
  } catch (err) {
    return next(err);
  }
});
