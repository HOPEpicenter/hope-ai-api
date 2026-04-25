import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { IntegrationService } from "../../services/integration/integrationService";
import { normalizeTimelineItem } from "../../lib/timeline/normalize-timeline-item";
import { GlobalTimelineRepository } from "../../repositories/globalTimelineRepository";

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

    const rawLimit = Number(req?.query?.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(200, Math.trunc(rawLimit)))
      : 50;
    const cursor =
      typeof req?.query?.cursor === "string" && req.query.cursor.trim().length > 0
        ? req.query.cursor.trim()
        : undefined;

    const debugShadow =
      String(req?.query?.debugShadow ?? "").trim() === "1" ||
      String(req?.query?.debugShadow ?? "").trim().toLowerCase() === "true";

    const service = new IntegrationService(new EngagementEventsRepository());
    const page = await service.readGlobalIntegratedTimeline(limit, cursor);

    const normalizedItems = (page.items ?? []).map((item: any) =>
      normalizeTimelineItem(item)
    );

    if (!debugShadow) {
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: true,
          items: page.items,
          normalizedItems,
          nextCursor: page.nextCursor ?? null
        }
      };
    }

    let shadowCount: number | null = null;
    let shadowError: string | null = null;

    try {
      const repo = new GlobalTimelineRepository();
      const shadow = await repo.read(limit, cursor);
      shadowCount = Array.isArray(shadow.items) ? shadow.items.length : 0;
    } catch (err: any) {
      shadowError = String(err?.message ?? err);
    }

    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        items: page.items,
        normalizedItems,
        nextCursor: page.nextCursor ?? null,
        debug: {
          shadowEnabled: true,
          legacyCount: Array.isArray(page.items) ? page.items.length : 0,
          shadowCount,
          shadowError
        }
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


