import { TableClient } from "@azure/data-tables";

/**
 * Central place to create TableClient.
 * - Works with real Azure Storage
 * - Works with Azurite (http) by enabling allowInsecureConnection when detected
 *
 * NOTE: We intentionally do NOT import TableClientOptions because some @azure/data-tables
 * versions do not export it. We pass options as `any`.
 */
export function makeTableClient(connectionString: string, tableName: string): TableClient {
  if (!connectionString) throw new Error("makeTableClient: connectionString is required");
  if (!tableName) throw new Error("makeTableClient: tableName is required");

  const isAzurite =
    /UseDevelopmentStorage=true/i.test(connectionString) ||
    /devstoreaccount1/i.test(connectionString) ||
    /127\.0\.0\.1/i.test(connectionString) ||
    /localhost/i.test(connectionString);

  // Some environments/libs require allowInsecureConnection for Azurite (http).
  const options: any = isAzurite ? { allowInsecureConnection: true } : undefined;

  // @azure/data-tables: TableClient.fromConnectionString(connectionString, tableName, options?)
  return TableClient.fromConnectionString(connectionString, tableName, options);
}
