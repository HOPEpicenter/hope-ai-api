import { getTableClient } from "../../functions/_shared/tableClient";
import type { VisitorEvent } from "./resolveVisitorEventContext";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type StoredEvent = {
  partitionKey?: unknown;
  rowKey?: unknown;
  name?: unknown;
  active?: unknown;
};

type Dependencies = {
  readRows?: (date: string) => AsyncIterable<StoredEvent>;
};

function validDate(date: string): boolean {
  if (!DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date;
}

/**
 * Read approved, persisted church events.
 * Public requests cannot supply the directory or create events.
 * Missing storage and malformed records fail closed.
 */
export async function listApprovedVisitorEvents(
  date: string,
  dependencies: Dependencies = {}
): Promise<readonly VisitorEvent[]> {
  if (!validDate(date)) {
    throw new Error("Invalid visitor event date");
  }

  const readRows = dependencies.readRows ?? ((selectedDate: string) => {
    const table = getTableClient("VisitorEvents");
    const partition = `date-${selectedDate}`;

    return table.listEntities<StoredEvent>({
      queryOptions: {
        filter: `PartitionKey eq '${partition}'`,
        select: ["PartitionKey", "RowKey", "name", "active"]
      }
    });
  });

  const events: VisitorEvent[] = [];
  const seen = new Set<string>();

  for await (const row of readRows(date)) {
    const partition = `date-${date}`;

    if (
      row.partitionKey !== partition ||
      typeof row.rowKey !== "string" ||
      !ID.test(row.rowKey) ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 120 ||
      typeof row.active !== "boolean" ||
      seen.has(row.rowKey)
    ) {
      throw new Error("Invalid canonical visitor event record");
    }

    seen.add(row.rowKey);

    events.push({
      id: row.rowKey,
      date,
      name: row.name.trim(),
      active: row.active
    });
  }

  return events;
}