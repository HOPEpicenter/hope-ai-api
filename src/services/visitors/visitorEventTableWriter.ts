import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import type {
  StoredVisitorEvent,
  VisitorEventWriter
} from "./createVisitorEvent";

const TABLE_NAME = "VisitorEvents";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type VisitorEventRow = {
  partitionKey: string;
  rowKey: string;
  date: string;
  name: string;
  active: boolean;
  commandId: string;
  actorId: string;
};

type WriterTable = Pick<
  TableClient,
  "createEntity" | "getEntity"
>;

function isConflict(error: unknown): boolean {
  const candidate = error as {
    statusCode?: number;
    code?: string;
  } | null;

  return candidate?.statusCode === 409 ||
    candidate?.code === "EntityAlreadyExists";
}

function isMissing(error: unknown): boolean {
  const candidate = error as {
    statusCode?: number;
    code?: string;
  } | null;

  return candidate?.statusCode === 404 ||
    candidate?.code === "ResourceNotFound" ||
    candidate?.code === "EntityNotFound";
}

function partition(date: string): string {
  if (!DATE.test(date)) {
    throw new Error("Invalid event partition date");
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid event partition date");
  }
  return "directory";
}

function validRecord(record: StoredVisitorEvent): boolean {
  return Boolean(
    record &&
    typeof record.id === "string" &&
    ID.test(record.id) &&
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    record.name.length <= 120 &&
    typeof record.commandId === "string" &&
    record.commandId.length > 0 &&
    typeof record.actorId === "string" &&
    record.actorId.trim().length > 0 &&
    record.active === true
  );
}

/**
 * Uses the exact VisitorEvents table schema consumed by the reader.
 * Does not provision tables, grant roles, or expose an HTTP endpoint.
 */
export function createVisitorEventTableWriter(
  table: WriterTable = getTableClient(TABLE_NAME)
): VisitorEventWriter {
  return {
    async create(record): Promise<"created" | "exists"> {
      if (!validRecord(record)) {
        throw new Error("Invalid canonical visitor event");
      }

      const row: VisitorEventRow = {
        partitionKey: partition(record.date),
        rowKey: record.id,
        date: record.date,
        name: record.name,
        active: true,
        commandId: record.commandId,
        actorId: record.actorId
      };

      try {
        await table.createEntity(row);
        return "created";
      } catch (error) {
        if (isConflict(error)) return "exists";
        throw error;
      }
    },

    async read(date, id): Promise<StoredVisitorEvent | null> {
      const partitionKey = partition(date);
      if (!ID.test(id)) {
        throw new Error("Invalid canonical event ID");
      }

      let row: VisitorEventRow;

      try {
        row = await table.getEntity<VisitorEventRow>(
          partitionKey,
          id
        );
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }

      if (
        row.partitionKey !== partitionKey ||
        row.rowKey !== id ||
        typeof row.date !== "string" ||
        !DATE.test(row.date) ||
        partition(row.date) !== "directory" ||
        typeof row.name !== "string" ||
        !row.name.trim() ||
        row.name.length > 120 ||
        typeof row.active !== "boolean" ||
        typeof row.commandId !== "string" ||
        !row.commandId.trim() ||
        typeof row.actorId !== "string" ||
        !row.actorId.trim()
      ) {
        throw new Error("Malformed canonical visitor event row");
      }

      return {
        id,
        date: row.date,
        name: row.name,
        active: row.active,
        commandId: row.commandId,
        actorId: row.actorId
      };
    }
  };
}