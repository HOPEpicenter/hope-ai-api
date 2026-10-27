import { paginateRowKeyItems } from "../shared/timeline/rowKeyPaginator";
import { buildRowKey } from "../shared/timeline/globalTimelineRowKey";
import { getTableClient } from "../storage/tableClient";
import { ensureTableExists } from "../shared/storage/ensureTableExists";

export const GLOBAL_TIMELINE_TABLE =
  process.env.GLOBAL_TIMELINE_TABLE || "devGlobalTimeline";

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

export class GlobalTimelineRepository {
  private async getTable() {
    const table = await getTableClient(GLOBAL_TIMELINE_TABLE);
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

    try {
      await table.createEntity(entity as any);
    } catch (err: any) {
      if (err?.statusCode === 409) {
        // already exists → idempotent no-op
        return;
      }
      throw err;
    }
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

    return paginateRowKeyItems(entities, safeLimit);
  }
}




