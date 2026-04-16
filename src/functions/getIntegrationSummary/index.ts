import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";

export async function getIntegrationSummary(context: any, req: any): Promise<any> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      return {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
    }

    const visitorId = String(req?.query?.visitorId ?? "").trim();
    if (!visitorId) {
      return {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
    }

    const service = new IntegrationService(new EngagementEventsRepository());

    const summary = await service.readIntegrationSummary(visitorId);

    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        v: 1,
        visitorId,
        summary
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    return {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}

