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

export class EngagementEventsRepository {
  async appendEvent(evt: EngagementEventEnvelopeV1): Promise<void> {
    const table = await getTableClient(TABLE_NAME);

    const entity: any = {
      partitionKey: evt.visitorId,
      rowKey: makeRowKey(evt),
      ...evt,
      data: evt.data ?? {},
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
    let lastRowKey: string | undefined;

    const pageSize = limit + 1;

    const filter = safeAfter
      ? `PartitionKey eq '${safeVisitorId}' and RowKey gt '${safeAfter}'`
      : `PartitionKey eq '${safeVisitorId}'`;

    const iter = table.listEntities<any>({
      queryOptions: { filter },
    });

    for await (const e of iter) {
      const evt: EngagementEventEnvelopeV1 = {
        v: e.v,
        eventId: e.eventId,
        visitorId: e.visitorId,
        type: e.type,
        occurredAt: e.occurredAt,
        source: e.source,
        data: e.data ?? {},
      };

      items.push(evt);
      lastRowKey = e.rowKey;

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
