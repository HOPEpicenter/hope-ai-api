import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";

export const integrationRouter = Router();

// Scope auth to /integration only
integrationRouter.use("/integration", requireApiKey);

const service = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository()
);

integrationRouter.get("/integration/timeline", async (req, res, next) => {
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
    const page = await service.readIntegratedTimeline(visitorId, limit, cursor);

    return res.status(200).json({
  ok: true,
  items: page.items,
  nextCursor: page.nextCursor ?? null,
});} catch (err) {
    return next(err);
  }
});


