import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

const engagementSummaryRepo = new EngagementSummaryRepository();

const integrationService = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository()
);

export async function getVisitorSummary(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const visitorId = String(req?.params?.id ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const [engagementSummary, integrationSummary, timelinePage] = await Promise.all([
      engagementSummaryRepo.get(visitorId),
      integrationService.readIntegrationSummary(visitorId),
      integrationService.readIntegratedTimeline(visitorId, 5)
    ]);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        v: 1,
        visitorId,
        summary: {
          engagement: {
            summary: engagementSummary ?? null,
            timelinePreview: timelinePage?.items ?? []
          },
          integration: integrationSummary ?? null
        }
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}
