import type {
  TableClient,
  TransactionAction
} from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import type {
  VisitorEventUpdateRepository
} from "./updateVisitorEvent";
import type { VisitorEvent } from "./resolveVisitorEventContext";

const TABLE = "VisitorEvents";
const PARTITION = "directory";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type EventRow = {
  partitionKey: string;
  rowKey: string;
  date: string;
  name: string;
  active: boolean;
  commandId: string;
  actorId: string;
  lastCommandId?: string;
  lastCommandFingerprint?: string;
  etag?: string;
};

type Table = Pick<TableClient, "getEntity" | "submitTransaction">;

function missing(error: unknown): boolean {
  const value = error as {
    statusCode?: number;
    code?: string;
  } | null;

  return value?.statusCode === 404 ||
    value?.code === "ResourceNotFound" ||
    value?.code === "EntityNotFound";
}

function conflict(error: unknown): boolean {
  const value = error as {
    statusCode?: number;
    code?: string;
  } | null;

  return value?.statusCode === 409 ||
    value?.statusCode === 412 ||
    value?.code === "EntityAlreadyExists" ||
    value?.code === "UpdateConditionNotSatisfied";
}

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function validateEvent(event: VisitorEvent): void {
  if (!event ||
      typeof event.id !== "string" ||
      !ID.test(event.id) ||
      typeof event.date !== "string" ||
      !validDate(event.date) ||
      typeof event.name !== "string" ||
      !event.name.trim() ||
      event.name.length > 120 ||
      typeof event.active !== "boolean") {
    throw new Error("Invalid canonical event update");
  }
}

/**
 * Durable, atomic update foundation.
 *
 * Both the event-row update and immutable command record use the
 * same Azure Table partition and one transactional batch.
 *
 * This repository does not create tables or expose an HTTP route.
 */
export function createVisitorEventUpdateRepository(
  table: Table = getTableClient(TABLE)
): VisitorEventUpdateRepository {
  return {
    async readCommand(commandId) {
      if (typeof commandId !== "string" ||
          !UUID.test(commandId)) {
        throw new Error("Invalid event command ID");
      }

      const key = `visitor-event-command-${commandId.toLowerCase()}`;
      let row: {
        partitionKey?: string;
        rowKey?: string;
        eventId?: string;
        fingerprint?: string;
        active?: boolean;
        type?: string;
      };

      try {
        row = await table.getEntity(PARTITION, key);
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }

      if (row.partitionKey !== PARTITION ||
          row.rowKey !== key ||
          typeof row.eventId !== "string" ||
          !ID.test(row.eventId) ||
          typeof row.fingerprint !== "string" ||
          !row.fingerprint ||
          typeof row.active !== "boolean" ||
          row.type !== "visitorEvent.updated") {
        throw new Error("Malformed visitor event command history");
      }

      return {
        eventId: row.eventId,
        fingerprint: row.fingerprint,
        active: row.active
      };
    },

    async read(eventId) {
      if (!ID.test(eventId)) {
        throw new Error("Invalid canonical event ID");
      }

      let row: EventRow;

      try {
        row = await table.getEntity<EventRow>(
          PARTITION,
          eventId
        );
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }

      if (
        row.partitionKey !== PARTITION ||
        row.rowKey !== eventId ||
        !validDate(row.date) ||
        typeof row.name !== "string" ||
        !row.name.trim() ||
        row.name.length > 120 ||
        typeof row.active !== "boolean" ||
        typeof row.etag !== "string" ||
        !row.etag ||
        (row.lastCommandId !== undefined &&
          (typeof row.lastCommandId !== "string" ||
           !UUID.test(row.lastCommandId))) ||
        (row.lastCommandFingerprint !== undefined &&
          typeof row.lastCommandFingerprint !== "string") ||
        ((row.lastCommandId === undefined) !==
         (row.lastCommandFingerprint === undefined))
      ) {
        throw new Error("Malformed canonical event snapshot");
      }

      return {
        event: {
          id: eventId,
          date: row.date,
          name: row.name,
          active: row.active
        },
        version: row.etag,
        ...(row.lastCommandId === undefined ? {} : {
          lastCommandId: row.lastCommandId,
          lastCommandFingerprint: row.lastCommandFingerprint
        })
      };
    },

    async updateIfVersion(
      event,
      version,
      commandId,
      fingerprint
    ) {
      validateEvent(event);

      if (
        typeof version !== "string" ||
        !version ||
        typeof commandId !== "string" ||
        !UUID.test(commandId) ||
        typeof fingerprint !== "string" ||
        !fingerprint
      ) {
        throw new Error("Invalid event update concurrency metadata");
      }

      const normalizedCommandId = commandId.toLowerCase();

      const actions: TransactionAction[] = [
        [
          "update",
          {
            partitionKey: PARTITION,
            rowKey: event.id,
            date: event.date,
            name: event.name,
            active: event.active,
            lastCommandId: normalizedCommandId,
            lastCommandFingerprint: fingerprint
          },
          "Merge",
          { etag: version }
        ],
        [
          "create",
          {
            partitionKey: PARTITION,
            rowKey: `visitor-event-command-${normalizedCommandId}`,
            eventId: event.id,
            fingerprint,
            active: event.active,
            type: "visitorEvent.updated",
            occurredAt: new Date().toISOString()
          }
        ]
      ];

      try {
        await table.submitTransaction(actions);
        return true;
      } catch (error) {
        if (conflict(error)) return false;
        throw error;
      }
    }
  };
}