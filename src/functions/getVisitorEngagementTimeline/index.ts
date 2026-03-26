import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";

const service = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository(),
);

function parseLimit(value: unknown, fallback = 50): number {
  const n = typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(n)));
}

export async function getVisitorEngagementTimeline(context: any, req: any): Promise<void> {
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

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const limit = parseLimit(req?.query?.limit, 50);
    const cursor = req?.query?.cursor
      ? String(req.query.cursor)
      : undefined;

    const page = await service.readIntegratedTimeline(visitorId, limit, cursor);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        limit,
        nextCursor: page.nextCursor ?? null,
        items: page.items ?? []
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
