import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  getFormationEventsTableClient,
  listFormationEventsByVisitorId
} from "../_shared/formation";

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toOpsFormationEvent(item: any): Record<string, unknown> {
  return {
    id: item.idempotencyKey ?? null,
    rowKey: item.rowKey ?? null,
    visitorId: item.visitorId ?? null,
    type: item.type ?? null,
    occurredAt: item.occurredAt ?? null,
    recordedAt: item.recordedAt ?? null,
    channel: item.channel ?? null,
    summary: item.summary ?? null,
    metadata: tryParseJson(item.metadata)
  };
}

export async function getOpsFormationRecentEvents(context: any, req: any): Promise<void> {
  const auth = requireApiKeyForFunction(req);
  if (!auth.ok) {
    return;
  }

  const visitorId = String(req?.query?.visitorId ?? "").trim();
  if (!visitorId) {
    context.res = {
      status: 400,
      body: { ok: false, error: "visitorId is required" }
    };
    return;
  }

  const rawLimit = Number(req?.query?.limit ?? 20);
  const limit = Math.max(1, Math.min(rawLimit || 20, 100));
  const beforeRowKey = String(req?.query?.before ?? "").trim() || undefined;

  try {
    const table = getFormationEventsTableClient();
    const items = await listFormationEventsByVisitorId(table, { visitorId, limit, beforeRowKey } as any);
    const shapedItems = items.map(toOpsFormationEvent);
    const nextCursor = items.length >= limit ? items[items.length - 1]?.rowKey ?? null : null;

    context.res = {
      status: 200,
      body: {
        ok: true,
        visitorId,
        count: shapedItems.length,
        nextCursor,
        items: shapedItems
      }
    };
  } catch (err: any) {
    context.res = {
      status: 500,
      body: {
        ok: false,
        error: String(err?.message ?? err ?? "Unknown error")
      }
    };
  }
}
