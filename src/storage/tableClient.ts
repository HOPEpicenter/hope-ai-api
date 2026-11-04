import { TableClient } from "@azure/data-tables";
import {
  createHopeTableClient,
  createHopeTableServiceClient
} from "../shared/storage/createHopeTableClient";

const authMode = process.env.HOPE_TABLE_AUTH_MODE?.trim() || "connection-string";

if (authMode !== "connection-string" && authMode !== "managed-identity") {
  throw new Error("Unsupported Table Storage authentication mode.");
}

const connectionString: string | undefined =
  authMode === "connection-string"
    ? (() => {
        const value = process.env.STORAGE_CONNECTION_STRING;
        if (!value) throw new Error("STORAGE_CONNECTION_STRING is not set.");
        return value;
      })()
    : undefined;

const storageConfig = authMode === "managed-identity"
  ? {
      mode: "managed-identity" as const,
      endpoint: process.env.HOPE_TABLE_ENDPOINT,
      managedIdentityClientId: process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID
    }
  : {
      mode: "connection-string" as const,
      connectionString
    };

const serviceClient = createHopeTableServiceClient(storageConfig);

/**
 * Returns a TableClient and ensures the table exists.
 * Works for Azurite (UseDevelopmentStorage=true) and Azure Storage.
 */
export async function getTableClient(tableName: string): Promise<TableClient> {
  const tableClient = createHopeTableClient(tableName, storageConfig);

  await serviceClient.createTable(tableName).catch((err: any) => {
    const msg = String(err?.message ?? "");
    const code = String(err?.code ?? "");
    if (
      code === "TableAlreadyExists" ||
      msg.includes("TableAlreadyExists") ||
      msg.includes("The table specified already exists")
    ) {
      return;
    }
    throw err;
  });

  return tableClient;
}
