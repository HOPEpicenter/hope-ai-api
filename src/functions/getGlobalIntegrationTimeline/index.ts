import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";

export async function getGlobalIntegrationTimeline(context: any, req: any): Promise<any> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      return {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
    }

    const limit = Number(req?.query?.limit ?? 50);
    const cursor =
      typeof req?.query?.cursor === "string" && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : undefined;

    const service = new IntegrationService(new EngagementEventsRepository());

    const page = await service.readGlobalIntegratedTimeline(limit, cursor);

    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        items: page.items,
        nextCursor: page.nextCursor ?? null
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

