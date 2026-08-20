import type { TableClient } from "@azure/data-tables";
import type {
  SixWeekFollowupEvent,
  SixWeekFollowupEventType
} from "../domain/followups/projectSixWeekVisitorFollowup";
import { getTableClient } from "../storage/tableClient";

type SixWeekFollowupEventEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  visitorId: string;
  type: SixWeekFollowupEventType;
  occurredAt: string;
  actorId: string;
  dataJson: string;
};

const TABLE_NAME = "VisitorFollowupEvents";

function rowKeyFor(event: SixWeekFollowupEvent): string {
  if (event.type === "six_week_followup.plan_started") {
    return "0000__plan-started";
  }

  if (
    event.type === "six_week_followup.task_completed" ||
    event.type === "six_week_followup.task_skipped"
  ) {
    const week = String(event.data.weekNumber ?? 0).padStart(2, "0");
    return `1000__task-${week}-outcome`;
  }

  return `${event.occurredAt}__${event.eventId}`;
}

function fromEntity(
  entity: SixWeekFollowupEventEntity
): SixWeekFollowupEvent {
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

export class SixWeekFollowupEventsRepository {
  async append(event: SixWeekFollowupEvent): Promise<boolean> {
    const table: TableClient = await getTableClient(TABLE_NAME);

    try {
      await table.createEntity<SixWeekFollowupEventEntity>({
        partitionKey: event.visitorId,
        rowKey: rowKeyFor(event),
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

  async listByVisitor(visitorId: string): Promise<SixWeekFollowupEvent[]> {
    const table: TableClient = await getTableClient(TABLE_NAME);
    const events: SixWeekFollowupEvent[] = [];
    const escaped = visitorId.replace(/'/g, "''");
    const filter = `PartitionKey eq '${escaped}'`;

    for await (const entity of table.listEntities<SixWeekFollowupEventEntity>({
      queryOptions: { filter }
    })) {
      events.push(fromEntity(entity));
    }

    return events;
  }

  async listAll(): Promise<SixWeekFollowupEvent[]> {
    const table: TableClient = await getTableClient(TABLE_NAME);
    const events: SixWeekFollowupEvent[] = [];

    for await (const entity of table.listEntities<SixWeekFollowupEventEntity>()) {
      events.push(fromEntity(entity));
    }

    return events;
  }
}
