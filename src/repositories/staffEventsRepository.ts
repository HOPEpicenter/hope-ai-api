import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../storage/tableClient";
import type {
  StaffEvent,
  StaffEventType
} from "../domain/staff/projectStaffDirectory";

type StaffEventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  staffId: string;
  type: StaffEventType;
  occurredAt: string;
  actorId: string;
  dataJson: string;
};

const TABLE_NAME = "StaffEvents";

function rowKeyFor(event: StaffEvent): string {
  return `${event.occurredAt}__${event.eventId}`;
}

function fromEntity(entity: StaffEventEntity): StaffEvent {
  return {
    eventId: entity.eventId,
    staffId: entity.staffId,
    type: entity.type,
    occurredAt: entity.occurredAt,
    actorId: entity.actorId,
    data: JSON.parse(entity.dataJson || "{}")
  };
}

export class StaffEventsRepository {
  async append(event: StaffEvent): Promise<void> {
    const table: TableClient = await getTableClient(TABLE_NAME);

    await table.createEntity<StaffEventEntity>({
      partitionKey: event.staffId,
      rowKey: rowKeyFor(event),
      eventId: event.eventId,
      staffId: event.staffId,
      type: event.type,
      occurredAt: event.occurredAt,
      actorId: event.actorId,
      dataJson: JSON.stringify(event.data)
    });
  }

  async listAll(): Promise<StaffEvent[]> {
    const table: TableClient = await getTableClient(TABLE_NAME);
    const events: StaffEvent[] = [];

    for await (const entity of table.listEntities<StaffEventEntity>()) {
      events.push(fromEntity(entity));
    }

    return events;
  }
}
