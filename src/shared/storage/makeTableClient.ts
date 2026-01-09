import { TableClient } from "@azure/data-tables";
import { tableName } from "../../storage/tableName";

function isAzurite(cs: string): boolean {
  const s = String(cs ?? "").trim();
  const low = s.toLowerCase();
  // Support both shorthand and full Azurite connection strings
  return (
    low === "usedevelopmentstorage=true" ||
    low.includes("devstoreaccount1") ||
    low.includes("tableendpoint=http://127.0.0.1:10002") ||
    low.includes("tableendpoint=http://localhost:10002") ||
    low.includes("127.0.0.1:10002") ||
    low.includes("localhost:10002")
  );
}

export function makeTableClient(connectionString: string, logicalTableName: string): TableClient {
  const options = isAzurite(connectionString)
    ? ({ allowInsecureConnection: true } as const)
    : undefined;

  return TableClient.fromConnectionString(connectionString, tableName(logicalTableName), options);
}

