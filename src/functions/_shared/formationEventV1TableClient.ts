import { getTableClient as getHopeTableClient } from "./tableClient";
import { TableClient } from "@azure/data-tables";
import { getConnString } from "./tableClient";

const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";

export function getFormationEventV1TableClient(): TableClient {
  return getHopeTableClient(FORMATION_EVENTS_TABLE);
}
