import { Router } from "express";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { IntegrationService } from "../../services/integration/integrationService";

export const engagementsTimelineRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());
const integratedTimelineService = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository(),
);

engagementsTimelineRouter.get("/engagements/timeline", async (req, res, next) => {
  try {
    const parsed = validateTimelineQueryV1(req.query);

    if (!parsed.ok) {
      return res.status(400).json({
        ok: false,
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
      ok: true,
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

engagementsTimelineRouter.get("/engagements/:visitorId/timeline", async (req, res, next) => {
  try {
    const visitorId = String(req.params.visitorId ?? "").trim();
    if (!visitorId) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "visitorId is required",
          details: [{ path: "visitorId", message: "visitorId is required" }],
        },
      });
    }

    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const rawCursor = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;

    const limit =
      typeof rawLimit === "string" && rawLimit.trim() !== ""
        ? Number(rawLimit)
        : 50;

    if (!Number.isFinite(limit) || Math.trunc(limit) !== limit || limit < 1 || limit > 200) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "limit must be an integer between 1 and 200",
          details: [{ path: "limit", message: "limit must be an integer between 1 and 200" }],
        },
      });
    }

    const cursor =
      typeof rawCursor === "string" && rawCursor.trim() !== ""
        ? rawCursor
        : undefined;

    const page = await integratedTimelineService.readIntegratedTimeline(
      visitorId,
      limit,
      cursor,
    );

    return res.status(200).json({
      ok: true,
      v: 1,
      visitorId,
      limit,
      nextCursor: page.nextCursor ?? null,
      items: page.items ?? [],
    });
  } catch (err) {
    return next(err);
  }
});
