import { TableClient } from "@azure/data-tables";
import { getTableClient } from "../tableClient"; // corrected path

export interface VisitorStatusHistory {
  partitionKey: string;
  rowKey: string;
  status: string;
  note?: string;
  createdAt: string;
}

export async function listStatusHistory(visitorId: string): Promise<VisitorStatusHistory[]> {
  const client: TableClient = await getTableClient("visitorStatusHistory");

  const entities = client.listEntities<VisitorStatusHistory>({
    queryOptions: { filter: `PartitionKey eq '${visitorId}'` }
  });

  const results: VisitorStatusHistory[] = [];
  for await (const e of entities) {
    results.push(e);
  }

  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}
