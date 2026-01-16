// src/shared/storage/ensureTableExists.ts
import { TableClient } from "@azure/data-tables";

/**
 * Create the table if it doesn't exist.
 * In CI/Azurite it is common to see "already exists" races; treat those as OK.
 */
function isAlreadyExistsError(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  const code = err?.code ?? err?.details?.errorCode;

  // Azure Tables + Azurite commonly respond with 409 for already-exists cases
  // and may use one of these error codes depending on SDK/runtime.
  return (
    status === 409 ||
    code === "TableAlreadyExists" ||
    code === "TableBeingDeleted" ||
    code === "EntityAlreadyExists"
  );
}

export async function ensureTableExists(table: TableClient): Promise<void> {
  try {
    await table.createTable();
  } catch (err: any) {
    if (isAlreadyExistsError(err)) return;
    throw err;
  }
}
