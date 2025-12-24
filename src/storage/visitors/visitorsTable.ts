import { tableName } from "../tableName";
// src/storage/visitors/visitorsTable.ts
import { TableClient } from "@azure/data-tables";

export const VISITORS_TABLE = "Visitors";
export const VISITORS_PARTITION_KEY = "VISITOR";

/**
 * Create a TableClient using STORAGE_CONNECTION_STRING for Visitors table
 */
export function getVisitorsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error(
      "Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json"
    );
  }
  return TableClient.fromConnectionString(conn, tableName(VISITORS_TABLE));
}

/**
 * Lookup a visitor entity by visitorId (property).
 * Assumes Visitors table stores visitorId as a string property.
 */
export async function getVisitorByVisitorId(
  table: TableClient,
  visitorId: string
): Promise<any | null> {
  const safeVisitorId = escapeOData(visitorId);
  const filter = `PartitionKey eq '${VISITORS_PARTITION_KEY}' and visitorId eq '${safeVisitorId}'`;

  for await (const v of table.listEntities({
    queryOptions: { filter },
  })) {
    return v as any;
  }

  return null;
}

/**
 * Throws 404-style error if visitor not found
 */
export async function ensureVisitorExists(visitorId: string): Promise<void> {
  const table = getVisitorsTableClient();
  const existing = await getVisitorByVisitorId(table, visitorId);

  if (!existing) {
    const err = new Error("Visitor not found.");
    (err as any).statusCode = 404;
    throw err;
  }
}

/**
 * Minimal OData escaping for single quotes
 */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

