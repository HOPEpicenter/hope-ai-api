import { TableClient } from "@azure/data-tables";
import { createHopeTableClient } from "../../shared/storage/createHopeTableClient";

export function getConnString(): string {
  return process.env.STORAGE_CONNECTION_STRING
    ?? process.env.AzureWebJobsStorage
    ?? "";
}

export function getTableClient(tableName: string): TableClient {
  const mode = process.env.HOPE_TABLE_AUTH_MODE?.trim() || "connection-string";

  if (mode === "managed-identity") {
    return createHopeTableClient(tableName, {
      mode: "managed-identity",
      endpoint: process.env.HOPE_TABLE_ENDPOINT,
      managedIdentityClientId: process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID
    });
  }

  if (mode !== "connection-string") {
    throw new Error("Unsupported Table Storage authentication mode.");
  }

  const conn = getConnString();
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");

  return createHopeTableClient(tableName, {
    mode: "connection-string",
    connectionString: conn
  });
}

export async function ensureTable(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (e: any) {
    // 409 = already exists
    const code = e?.statusCode ?? e?.status;
    if (code === 409) return;
    throw e;
  }
}
