import { TableClient } from "@azure/data-tables";
import { getConnString } from "./tableClient";

const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";

export function getFormationEventV1TableClient(): TableClient {
  const connectionString = getConnString();
  if (!connectionString) {
    throw new Error("Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage).");
  }
  return TableClient.fromConnectionString(connectionString, FORMATION_EVENTS_TABLE);
}
