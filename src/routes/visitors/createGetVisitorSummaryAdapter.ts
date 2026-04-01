import type { Request, Response, NextFunction } from "express";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

const engagementSummaryRepo = new EngagementSummaryRepository();

const integrationService = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository()
);

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

      const [engagementSummary, integrationSummary, timelinePage] = await Promise.all([
        engagementSummaryRepo.get(visitorId),
        integrationService.readIntegrationSummary(visitorId),
        integrationService.readIntegratedTimeline(visitorId, 5)
      ]);

      return res.status(200).json({
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement: {
            summary: engagementSummary ?? null,
            timelinePreview: timelinePage?.items ?? []
          },
          integration: integrationSummary ?? null,
        },
      });
    } catch (err) {
      return next(err);
    }
  };
}
