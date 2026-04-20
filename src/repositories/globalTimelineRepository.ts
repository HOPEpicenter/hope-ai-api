import { getTableClient } from "../storage/tableClient";
import { ensureTableExists } from "../shared/storage/ensureTableExists";

const TABLE_NAME = "globalTimeline";

export type GlobalTimelineEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  visitorId?: string | null;
  stream: "engagement" | "formation" | "integration" | "system";
  type: string;
  occurredAt: string;
  summary?: string | null;
  source?: string | null;
  rawJson?: string | null;
};

export type GlobalTimelinePage = {
  items: GlobalTimelineEntity[];
  nextCursor: string | null;
};

const GLOBAL_PARTITION_KEY = "global";

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(200, Math.floor(limit)));
}

function toTicksDescending(iso: string): string {
  const ms = Date.parse(iso);
  const safeMs = Number.isFinite(ms) ? ms : 0;

  const max = 9999999999999;
  const desc = Math.max(0, max - safeMs);

  return String(desc).padStart(13, "0");
}

function buildRowKey(item: {
  occurredAt: string;
  eventId: string;
}): string {
  return `${toTicksDescending(item.occurredAt)}|${item.eventId}`;
}

export class GlobalTimelineRepository {
  private async getTable() {
    const table = await getTableClient(TABLE_NAME);
    await ensureTableExists(table);
    return table;
  }

  async append(item: {
    eventId: string;
    visitorId?: string | null;
    stream: "engagement" | "formation" | "integration" | "system";
    type: string;
    occurredAt: string;
    summary?: string | null;
    source?: string | null;
    raw?: unknown;
  }): Promise<void> {
    const table = await this.getTable();

    const entity: GlobalTimelineEntity = {
      partitionKey: GLOBAL_PARTITION_KEY,
      rowKey: buildRowKey(item),
      eventId: item.eventId,
      visitorId: item.visitorId ?? null,
      stream: item.stream,
      type: item.type,
      occurredAt: item.occurredAt,
      summary: item.summary ?? null,
      source: item.source ?? null,
      rawJson: item.raw == null ? null : JSON.stringify(item.raw)
    };

    await table.upsertEntity(entity, "Replace");
  }

  async read(limit: number, cursor?: string): Promise<GlobalTimelinePage> {
    const table = await this.getTable();

    const safeLimit = clampLimit(limit);
    const entities: GlobalTimelineEntity[] = [];

    const iter = table.listEntities<GlobalTimelineEntity>({
      queryOptions: {
        filter: `PartitionKey eq '${GLOBAL_PARTITION_KEY}'`
      }
    });

    for await (const entity of iter) {
      if (cursor && entity.rowKey <= cursor) continue;

      entities.push(entity);

      if (entities.length >= safeLimit + 1) break;
    }

    entities.sort((a, b) => {
      if (a.rowKey === b.rowKey) return 0;
      return a.rowKey < b.rowKey ? -1 : 1;
    });

    const pageItems = entities.slice(0, safeLimit);

    const nextCursor =
      entities.length > safeLimit
        ? pageItems[pageItems.length - 1]?.rowKey ?? null
        : null;

    return {
      items: pageItems,
      nextCursor
    };
  }
}
