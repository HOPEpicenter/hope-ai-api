import type { TableClient } from "@azure/data-tables";
import { readStaffWriterRuntimeEnforcement } from "../config/staffWriterRuntimeEnforcement";
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

/**
 * Reserved for future same-partition Staff security metadata.
 * This namespace is not an authorization or execution fence.
 */
export const STAFF_SECURITY_METADATA_HEAD =
  "__staff_security__head";

export const STAFF_SECURITY_METADATA_RECEIPT_PREFIX =
  "__staff_security__receipt__";

function isReservedSecurityMetadataRow(rowKey: string): boolean {
  return rowKey === STAFF_SECURITY_METADATA_HEAD ||
    rowKey.startsWith(STAFF_SECURITY_METADATA_RECEIPT_PREFIX);
}

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
  constructor(private readonly injectedTable?: TableClient) {}

  async append(event: StaffEvent): Promise<void> {
    // Deny legacy canonical appends while the Staff writer hold is active.
    // This does not authorize coordinated execution or prove production fencing.
    if (!readStaffWriterRuntimeEnforcement().allowLegacyWriter) {
      throw new Error("Canonical Staff event append is unavailable");
    }
    const table: TableClient =
      this.injectedTable ?? await getTableClient(TABLE_NAME);

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
    const table: TableClient =
      this.injectedTable ?? await getTableClient(TABLE_NAME);
    const events: StaffEvent[] = [];

    for await (const entity of table.listEntities<StaffEventEntity>()) {
      const rowKey = entity.rowKey;

      if (
        typeof rowKey === "string" &&
        isReservedSecurityMetadataRow(rowKey)
      ) {
        continue;
      }

      // Unknown rows are not treated as security metadata.
      // Malformed canonical events must not be silently ignored.
      if (
        typeof entity.eventId !== "string" ||
        !entity.eventId ||
        typeof entity.staffId !== "string" ||
        !entity.staffId ||
        typeof entity.type !== "string" ||
        ![
          "staff.created",
          "staff.updated",
          "staff.deactivated",
          "staff.invited",
          "staff.activated"
        ].includes(entity.type) ||
        typeof entity.occurredAt !== "string" ||
        !entity.occurredAt ||
        typeof entity.actorId !== "string" ||
        !entity.actorId ||
        typeof entity.dataJson !== "string"
      ) {
        throw new Error("Malformed canonical Staff event row");
      }

      const event = fromEntity(entity);

      if (
        event.data === null ||
        typeof event.data !== "object" ||
        Array.isArray(event.data)
      ) {
        throw new Error("Malformed canonical Staff event data");
      }

      events.push(event);
    }

    return events;
  }
}
