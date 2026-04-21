import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { validateIntegrationSummaryQueryV1 } from "../../contracts/integrationSummary.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { GlobalTimelineRepository } from "../../repositories/globalTimelineRepository";

export const integrationRouter = Router();

// Scope auth to /integration only
integrationRouter.use(requireApiKey);

const service = new IntegrationService(new EngagementEventsRepository());

integrationRouter.get("/integration/timeline", async (req, res, next) => {
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
    const page = await service.readIntegratedTimeline(visitorId, limit, cursor);

    return res.status(200).json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor ?? null,
    });
  } catch (err) {
    return next(err);
  }
});

integrationRouter.get("/integration/summary", async (req, res, next) => {
  try {
    const parsed = validateIntegrationSummaryQueryV1(req.query);
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

    const { visitorId } = parsed.value;
    const summary = await service.readIntegrationSummary(visitorId);

    return res.status(200).json({
      ok: true,
      v: 1,
      visitorId,
      summary,
    });
  } catch (err) {
    return next(err);
  }
});



integrationRouter.get("/integration/timeline/global", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const debugShadow =
      String(req.query.debugShadow ?? "").trim() === "1" ||
      String(req.query.debugShadow ?? "").trim().toLowerCase() === "true";

    const page = await service.readGlobalIntegratedTimeline(limit, cursor);

    if (!debugShadow) {
      return res.status(200).json({
        ok: true,
        items: page.items,
        nextCursor: page.nextCursor ?? null,
      });
    }

    let shadowCount: number | null = null;
    let shadowError: string | null = null;

    try {
      const repo = new GlobalTimelineRepository();
      const shadow = await repo.read(Math.max(1, Math.min(200, Number(limit || 50))), cursor);
      shadowCount = Array.isArray(shadow.items) ? shadow.items.length : 0;
    } catch (err: any) {
      shadowError = String(err?.message ?? err);
    }

    return res.status(200).json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor ?? null,
      debug: {
        shadowEnabled: true,
        legacyCount: Array.isArray(page.items) ? page.items.length : 0,
        shadowCount,
        shadowError,
      },
    });
  } catch (err) {
    return next(err);
  }
});










