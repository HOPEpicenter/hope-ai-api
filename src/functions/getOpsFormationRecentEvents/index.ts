import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  getFormationEventsTableClient,
  listFormationEventsByVisitorId
} from "../_shared/formation";

function normalizeQueryIso(value: unknown, fieldName: string): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) {
    return undefined;
  }

  const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/;
  if (!isoUtcPattern.test(text)) {
    throw new Error(fieldName + " must be a valid UTC ISO timestamp ending in Z");
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(fieldName + " must be a valid ISO timestamp");
  }

  return parsed.toISOString();
}

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

async function listRecentFormationEvents(table: any, options: {
  limit: number;
  beforeRowKey?: string;
  sinceOccurredAt?: string;
  untilOccurredAt?: string;
}): Promise<any[]> {
  const formationTypes = new Set([
    "NEXT_STEP_SELECTED"
  ]);

  const filterParts: string[] = [];

  if (options.beforeRowKey) {
    filterParts.push(`RowKey lt '${String(options.beforeRowKey).replace(/'/g, "''")}'`);
  }

  if (options.sinceOccurredAt) {
    filterParts.push(`occurredAt ge '${String(options.sinceOccurredAt).replace(/'/g, "''")}'`);
  }

  if (options.untilOccurredAt) {
    filterParts.push(`occurredAt le '${String(options.untilOccurredAt).replace(/'/g, "''")}'`);
  }

  const filter = filterParts.length ? filterParts.join(" and ") : undefined;
  const results: any[] = [];

  const entities = table.listEntities({
    queryOptions: {
      filter
    }
  });

  for await (const entity of entities) {
    const type = String(entity?.type ?? "").trim();
    if (!formationTypes.has(type)) {
      continue;
    }

    results.push(entity);

    if (results.length >= options.limit) {
      break;
    }
  }

  return results;
}

export async function getOpsFormationRecentEvents(context: any, req: any): Promise<void> {
  const auth = requireApiKeyForFunction(req);
  if (!auth.ok) {
    return;
  }

  const visitorId = String(req?.query?.visitorId ?? "").trim() || undefined;
  const rawLimit = Number(req?.query?.limit ?? 20);
  const limit = Math.max(1, Math.min(rawLimit || 20, 100));
  const beforeRowKey = String(req?.query?.before ?? "").trim() || undefined;

  try {
    const sinceOccurredAt = normalizeQueryIso(req?.query?.since, "since");
    const untilOccurredAt = normalizeQueryIso(req?.query?.until, "until");

    if (sinceOccurredAt && untilOccurredAt && sinceOccurredAt > untilOccurredAt) {
      context.res = {
        status: 400,
        body: { ok: false, error: "since must be less than or equal to until" }
      };
      return;
    }

    const table = getFormationEventsTableClient();

    const items = visitorId
      ? await listFormationEventsByVisitorId(table, {
          visitorId,
          limit,
          beforeRowKey,
          sinceOccurredAt,
          untilOccurredAt
        } as any)
      : await listRecentFormationEvents(table, {
          limit,
          beforeRowKey,
          sinceOccurredAt,
          untilOccurredAt
        });

    const shapedItems = items.map(toOpsFormationEvent);
    const nextCursor = items.length >= limit ? items[items.length - 1]?.rowKey ?? null : null;

    context.res = {
      status: 200,
      body: {
        ok: true,
        visitorId: visitorId ?? null,
        count: shapedItems.length,
        nextCursor,
        sinceOccurredAt: sinceOccurredAt ?? null,
        untilOccurredAt: untilOccurredAt ?? null,
        items: shapedItems
      }
    };
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Unknown error");
    const isValidationError =
      message.includes("must be a valid UTC ISO timestamp ending in Z") ||
      message.includes("must be a valid ISO timestamp");

    context.res = {
      status: isValidationError ? 400 : 500,
      body: {
        ok: false,
        error: message
      }
    };
  }
}



