import { TableClient } from "@azure/data-tables";

/**
 * TableClient factory (shared).
 * Callers pass an explicit connection string to keep behavior predictable.
 */
export function makeTableClient(connectionString: string, tableName: string): TableClient {
  if (!connectionString) throw new Error("makeTableClient: connectionString is required");
  if (!tableName) throw new Error("makeTableClient: tableName is required");

  return TableClient.fromConnectionString(connectionString, tableName);
}
