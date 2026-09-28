import type { TableClient, TransactionAction } from "@azure/data-tables";
import { getTableClient } from "../storage/tableClient";
import type { MinistryAreaEvent } from "../domain/ministryAreas/projectMinistryAreas";

const TABLE_NAME = "MinistryAreaEvents";
const PARTITION_KEY = "directory";
const HEAD_ROW = "head";

type EventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  ministryAreaId: string;
  type: MinistryAreaEvent["type"];
  occurredAt: string;
  actorId: string;
  sequence: number;
  dataJson: string;
};

export type MinistryAreaSnapshot = {
  events: MinistryAreaEvent[];
  version: string;
  revision: number;
};

function isStatus(error: unknown, status: number): boolean {
  const value = error as { statusCode?: number; code?: string };
  return value?.statusCode === status ||
    (status === 404 && value?.code === "ResourceNotFound") ||
    (status === 409 && value?.code === "EntityAlreadyExists");
}

export class MinistryAreaEventsRepository {
  private async table(): Promise<TableClient> {
    return getTableClient(TABLE_NAME);
  }

  async readSnapshot(): Promise<MinistryAreaSnapshot> {
    const table = await this.table();
    let head: { etag: string; revision?: number };

    try {
      head = await table.getEntity(PARTITION_KEY, HEAD_ROW);
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
      try {
        await table.createEntity({ partitionKey: PARTITION_KEY, rowKey: HEAD_ROW, revision: 0 });
      } catch (createError) {
        if (!isStatus(createError, 409)) throw createError;
      }
      head = await table.getEntity(PARTITION_KEY, HEAD_ROW);
    }

    const events: MinistryAreaEvent[] = [];
    for await (const entity of table.listEntities<EventEntity>({
      queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` }
    })) {
      if (!entity.eventId) continue;
      events.push({
        eventId: entity.eventId,
        ministryAreaId: entity.ministryAreaId,
        type: entity.type,
        occurredAt: entity.occurredAt,
        actorId: entity.actorId,
        sequence: entity.sequence,
        data: JSON.parse(entity.dataJson || "{}")
      });
    }
    return { events, version: head.etag, revision: Number(head.revision ?? 0) };
  }

  async appendIfVersion(event: MinistryAreaEvent, version: string): Promise<boolean> {
    const table = await this.table();
    const actions: TransactionAction[] = [
      ["update", {
        partitionKey: PARTITION_KEY,
        rowKey: HEAD_ROW,
        updatedAt: event.occurredAt,
        revision: event.sequence ?? 0
      }, "Merge", { etag: version }],
      ["create", {
        partitionKey: PARTITION_KEY,
        rowKey: event.eventId,
        eventId: event.eventId,
        ministryAreaId: event.ministryAreaId,
        type: event.type,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        sequence: event.sequence ?? 0,
        dataJson: JSON.stringify(event.data)
      }]
    ];
    try {
      await table.submitTransaction(actions);
      return true;
    } catch (error) {
      if (isStatus(error, 409) || isStatus(error, 412)) return false;
      throw error;
    }
  }
}
