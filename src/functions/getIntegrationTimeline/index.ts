import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";

export async function getIntegrationTimeline(context: any, req: any): Promise<void> {
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

    const visitorId = String(req?.query?.visitorId ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const limit = Number(req?.query?.limit ?? 50);
    const cursor = req?.query?.cursor;

    const service = new IntegrationService(new EngagementEventsRepository());
    const page = await service.readIntegratedTimeline(visitorId, limit, cursor);

    context.log("[integration-fn-debug]", JSON.stringify({
      visitorId,
      itemCount: Array.isArray(page?.items) ? page.items.length : -1,
      firstItem: Array.isArray(page?.items) && page.items.length > 0 ? page.items[0] : null,
      nextCursor: page?.nextCursor ?? null
    }));

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        items: page.items,
        nextCursor: page.nextCursor ?? null
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}
