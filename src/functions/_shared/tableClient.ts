import { TableClient } from "@azure/data-tables";

export function getConnString(): string {
  return process.env.STORAGE_CONNECTION_STRING
    ?? process.env.AzureWebJobsStorage
    ?? "";
}

export function getTableClient(tableName: string): TableClient {
  const conn = getConnString();
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  return TableClient.fromConnectionString(conn, tableName);
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
