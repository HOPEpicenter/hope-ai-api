import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { validateIntegrationSummaryQueryV1 } from "../../contracts/integrationSummary.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { buildShadowDebugEnvelope } from "../../shared/integration/buildShadowDebugEnvelope";
import { normalizeIntegrationQuery } from "../../shared/integration/normalizeIntegrationQuery";
import { buildProjectionIntegrityEnvelope } from "../../shared/integration/projectionIntegrityEnvelope";

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
    const {
      limit,
      cursor,
      debugShadow
    } = normalizeIntegrationQuery(req.query);

    const page = await service.readGlobalIntegratedTimeline(limit, cursor);

    if (!debugShadow) {
      return res.status(200).json({
        ok: true,
        items: page.items,
        nextCursor: page.nextCursor ?? null,
      });
    }

    return res.status(200).json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor ?? null,
      debug: await buildShadowDebugEnvelope(
        limit,
        cursor,
        page.items
      ),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * Phase 4 aggregation reads are additive and default to disabled.
 * Existing integration routes remain unchanged.
 */
async function respondWithPhase4Aggregate(
  req: any,
  res: any,
  next: any,
  select: (aggregate: any) => Record<string, unknown>
) {
  try {
    const {
      Phase4AggregationDisabledError,
      readPhase4Aggregate
    } = await import("../../services/aggregation/readPhase4Aggregate");

    const aggregate = await readPhase4Aggregate(String(req.params.id ?? ""));
    return res.status(200).json({ ok: true, ...select(aggregate) });
  } catch (error) {
    const { Phase4AggregationDisabledError } =
      await import("../../services/aggregation/readPhase4Aggregate");

    if (error instanceof Phase4AggregationDisabledError) {
      return res.status(503).json({
        ok: false,
        code: "PHASE4_AGGREGATION_DISABLED",
        message: "Phase 4 aggregation is not enabled."
      });
    }

    return next(error);
  }
}

integrationRouter.get("/person/:id/aggregate", (req, res, next) =>
  respondWithPhase4Aggregate(req, res, next, aggregate => ({ aggregate }))
);

integrationRouter.get("/person/:id/timeline", (req, res, next) =>
  respondWithPhase4Aggregate(req, res, next, aggregate => ({
    visitorId: aggregate.visitorId,
    timeline: aggregate.timeline,
    nextCursor: null
  }))
);

integrationRouter.get("/person/:id/readiness", (req, res, next) =>
  respondWithPhase4Aggregate(req, res, next, aggregate => ({
    visitorId: aggregate.visitorId,
    readiness: aggregate.readiness,
    ministryHealth: aggregate.ministryHealth
  }))
);

integrationRouter.get("/person/:id/snapshot", (req, res, next) =>
  respondWithPhase4Aggregate(req, res, next, aggregate => ({
    visitorId: aggregate.visitorId,
    snapshot: aggregate.snapshot
  }))
);
