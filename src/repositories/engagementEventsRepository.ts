import { EngagementEventEnvelopeV1 } from "../contracts/engagementEvent.v1";
import { decodeCursorV1, encodeCursorV1 } from "../contracts/timeline.v1";
import { getTableClient } from "../storage/tableClient";

const TABLE_NAME = "EngagementEvents";

export type TimelinePage = {
  items: EngagementEventEnvelopeV1[];
  nextCursor?: string;
};

function makeRowKey(evt: EngagementEventEnvelopeV1): string {
  // stable, sortable (ISO sorts lexicographically)
  return `${evt.occurredAt}|${evt.eventId}`;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "{}";
  }
}

function safeJsonParse<T>(s: unknown, fallback: T): T {
  if (typeof s !== "string" || s.trim() === "") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export class EngagementEventsRepository {
  async appendEvent(
    evt: EngagementEventEnvelopeV1,
    opts?: { idempotencyKey?: string }
  ): Promise<void> {
    const table = await getTableClient(TABLE_NAME);

    // Idempotency dedupe (best-effort): if caller provides Idempotency-Key, route generates deterministic eventId.
    // Avoid duplicate rows by checking for existing entity with same visitorId + eventId.
    if (opts?.idempotencyKey) {
      const safeVisitorId = escapeOData(evt.visitorId);
      const safeEventId = escapeOData(evt.eventId);
      const filter = `PartitionKey eq '${safeVisitorId}' and eventId eq '${safeEventId}'`;
      const iter = table.listEntities<any>({ queryOptions: { filter } });
      for await (const _ of iter) {
        return; // already exists
      }
    }

    // IMPORTANT: Azure Tables only supports primitive EDM types. Do not store objects directly.
    const entity: any = {
      partitionKey: evt.visitorId,
      rowKey: makeRowKey(evt),

      // envelope primitives
      v: evt.v,
      eventId: evt.eventId,
      visitorId: evt.visitorId,
      type: evt.type,
      occurredAt: evt.occurredAt,

      // store complex payload as JSON strings
      sourceJson: safeJsonStringify(evt.source ?? {}),
      dataJson: safeJsonStringify(evt.data ?? {}),
    };

    await table.createEntity(entity);
  }

  async readTimeline(visitorId: string, limit: number, cursor?: string): Promise<TimelinePage> {
    const table = await getTableClient(TABLE_NAME);

    let afterRowKey: string | undefined;
    if (cursor) {
      const decoded = decodeCursorV1(cursor);
      if (decoded.visitorId !== visitorId) throw new Error("Cursor visitorId mismatch");
      afterRowKey = decoded.after;
    }

    const safeVisitorId = escapeOData(visitorId);
    const safeAfter = afterRowKey ? escapeOData(afterRowKey) : undefined;

    const items: EngagementEventEnvelopeV1[] = [];

    const pageSize = limit + 1;

    const filter = safeAfter
      ? `PartitionKey eq '${safeVisitorId}' and RowKey gt '${safeAfter}'`
      : `PartitionKey eq '${safeVisitorId}'`;

    const iter = table.listEntities<any>({
      queryOptions: { filter },
    });

    for await (const e of iter) {
      const sourceParsed = safeJsonParse<{ system?: string; actorId?: string }>(e.sourceJson ?? e.source, {});
      const system =
        typeof sourceParsed.system === "string" && sourceParsed.system.trim()
          ? sourceParsed.system
          : "unknown";
      const actorId =
        typeof sourceParsed.actorId === "string" && sourceParsed.actorId.trim()
          ? sourceParsed.actorId
          : undefined;

      const evt: EngagementEventEnvelopeV1 = {
        v: e.v,
        eventId: e.eventId,
        visitorId: e.visitorId,
        type: e.type,
        occurredAt: e.occurredAt,
        source: actorId ? { system, actorId } : { system },
        data: safeJsonParse<Record<string, unknown>>(e.dataJson ?? e.data, {}),
      };

      items.push(evt);

      if (items.length >= pageSize) break;
    }

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    const lastReturned =
      pageItems.length > 0 ? makeRowKey(pageItems[pageItems.length - 1]) : undefined;

    return {
      items: pageItems,
      nextCursor:
        hasMore && lastReturned
          ? encodeCursorV1({ visitorId, after: lastReturned })
          : undefined,
    };
  }
}
