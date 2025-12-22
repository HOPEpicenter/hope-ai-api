// src/shared/storage/ensureTableExists.ts
import { TableClient } from "@azure/data-tables";

/** Ensure a table exists (idempotent). 409 = already exists. */
export async function ensureTableExists(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    if (err?.statusCode !== 409) throw err;
  }
}
