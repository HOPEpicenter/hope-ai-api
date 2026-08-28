import type { TableClient } from "@azure/data-tables";
import type {
  MinistryCommunicationEvent,
  MinistryCommunicationEventType
} from "../domain/communications/phase5CommunicationContracts";
import { getTableClient } from "../storage/tableClient";

type MinistryCommunicationEventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  visitorId: string;
  type: MinistryCommunicationEventType;
  occurredAt: string;
  actorId: string;
  dataJson: string;
};

const TABLE_NAME = "MinistryCommunicationEvents";

function fromEntity(
  entity: MinistryCommunicationEventEntity
): MinistryCommunicationEvent {
  return {
    eventId: entity.eventId,
    visitorId: entity.visitorId,
    type: entity.type,
    occurredAt: entity.occurredAt,
    actorId: entity.actorId,
    data: JSON.parse(entity.dataJson || "{}")
  };
}

function isConflict(error: any): boolean {
  const status = Number(error?.statusCode ?? error?.status ?? 0);
  const code = String(error?.code ?? "");

  return status === 409 || code === "EntityAlreadyExists";
}

/**
 * Append-only storage for Phase 5 communication history.
 *
 * This repository records staff-authored events only. It performs no message
 * delivery, provider invocation, scheduling, or browser-directed workflow.
 */
export class MinistryCommunicationEventsRepository {
  async append(event: MinistryCommunicationEvent): Promise<boolean> {
    const table: TableClient = await getTableClient(TABLE_NAME);

    try {
      await table.createEntity<MinistryCommunicationEventEntity>({
        partitionKey: event.visitorId,
        rowKey: event.eventId,
        eventId: event.eventId,
        visitorId: event.visitorId,
        type: event.type,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        dataJson: JSON.stringify(event.data)
      });

      return true;
    } catch (error: any) {
      if (isConflict(error)) return false;
      throw error;
    }
  }

  async listByVisitor(visitorId: string): Promise<MinistryCommunicationEvent[]> {
    const table: TableClient = await getTableClient(TABLE_NAME);
    const events: MinistryCommunicationEvent[] = [];
    const escaped = visitorId.replace(/'/g, "''");
    const filter = `PartitionKey eq '${escaped}'`;

    for await (const entity of table.listEntities<MinistryCommunicationEventEntity>({
      queryOptions: { filter }
    })) {
      events.push(fromEntity(entity));
    }

    return events;
  }
}
