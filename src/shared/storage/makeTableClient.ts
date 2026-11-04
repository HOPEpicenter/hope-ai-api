import { TableClient } from "@azure/data-tables";
import { createHopeTableClient } from "./createHopeTableClient";

/**
 * Central place to create TableClient.
 * - Works with real Azure Storage
 * - Works with Azurite (http) by enabling allowInsecureConnection when detected
 *
 * NOTE: We intentionally do NOT import TableClientOptions because some @azure/data-tables
 * versions do not export it. We pass options as `any`.
 */
export function makeTableClient(connectionString: string, tableName: string): TableClient {
  const mode = process.env.HOPE_TABLE_AUTH_MODE?.trim() || "connection-string";

  if (mode === "managed-identity") {
    return createHopeTableClient(tableName, {
      mode,
      connectionString: connectionString || undefined,
      endpoint: process.env.HOPE_TABLE_ENDPOINT,
      managedIdentityClientId: process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID
    });
  }

  if (mode !== "connection-string") {
    throw new Error("Unsupported Table Storage authentication mode.");
  }

  return createHopeTableClient(tableName, {
    mode: "connection-string",
    connectionString
  });
}
