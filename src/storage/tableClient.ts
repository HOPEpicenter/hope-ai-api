import { TableClient, TableServiceClient } from "@azure/data-tables";

const connectionString: string = (() => {
  const v = process.env.STORAGE_CONNECTION_STRING;
  if (!v) throw new Error("STORAGE_CONNECTION_STRING is not set.");
  return v;
})();

const serviceClient = TableServiceClient.fromConnectionString(connectionString);

/**
 * Returns a TableClient and ensures the table exists.
 * Works for Azurite (UseDevelopmentStorage=true) and Azure Storage.
 */
export async function getTableClient(tableName: string): Promise<TableClient> {
  const tableClient = TableClient.fromConnectionString(connectionString, tableName);

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
