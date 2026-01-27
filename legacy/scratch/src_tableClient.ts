import { TableClient } from "@azure/data-tables";

export async function getTableClient(tableName: string): Promise<TableClient> {
  const connectionString = process.env.AzureWebJobsStorage!;
  const client = TableClient.fromConnectionString(connectionString, tableName);
  return client;
}
