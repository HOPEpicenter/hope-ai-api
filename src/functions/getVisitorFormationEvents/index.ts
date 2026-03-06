import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationEventsTableClient,
  listFormationEventsByVisitorId
} from "../_shared/formation";

function parseLimit(val: unknown, fallback = 50): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export async function getVisitorFormationEvents(context: any, req: any): Promise<void> {
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

    const limit = parseLimit(req?.query?.limit, 50);
    const cursor = req?.query?.cursor ? String(req.query.cursor) : undefined;

    const table = getFormationEventsTableClient();
    await ensureTable(table);

    const fetchLimit = Math.max(500, limit * 50);
    const ascAll = await listFormationEventsByVisitorId(table, visitorId, {
      limit: fetchLimit,
      beforeRowKey: cursor
    });

    const start = Math.max(0, ascAll.length - limit);
    const pageAsc = ascAll.slice(start);

    const items = pageAsc
      .slice()
      .reverse()
      .map((event: any) => {
        let metadataObj: any = undefined;
        try {
          if (typeof event.metadata === "string" && event.metadata.trim()) {
            metadataObj = JSON.parse(event.metadata);
          }
        } catch {
          metadataObj = undefined;
        }

        return {
          id: event.idempotencyKey ?? event.rowKey,
          visitorId: event.visitorId,
          type: event.type,
          occurredAt: event.occurredAt,
          recordedAt: event.recordedAt,
          channel: event.channel,
          visibility: event.visibility,
          sensitivity: event.sensitivity,
          summary: event.summary,
          metadata: metadataObj,
          rowKey: event.rowKey
        };
      });

    const nextCursor = pageAsc.length > 0 ? pageAsc[0].rowKey : null;

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        items,
        cursor: nextCursor,
        nextCursor
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
