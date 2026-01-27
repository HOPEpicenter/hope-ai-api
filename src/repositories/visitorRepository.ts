import { TableClient } from "@azure/data-tables";

const VISITOR_TABLE = "devVisitors";

function getVisitorClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );
}

export async function listVisitors(): Promise<any[]> {
  const client = getVisitorClient();
  const visitors: any[] = [];

  for await (const entity of client.listEntities()) {
    visitors.push(entity);
  }

  return visitors;
}

export async function getVisitor(visitorId: string): Promise<any | null> {
  const client = getVisitorClient();

  try {
    return await client.getEntity("visitor", visitorId);
  } catch {
    return null;
  }
}

export async function createVisitor(visitor: any): Promise<any> {
  const client = getVisitorClient();
  await client.createEntity(visitor);
  return visitor;
}

export async function updateVisitor(visitor: any): Promise<any> {
  const client = getVisitorClient();
  await client.updateEntity(visitor, "Replace");
  return visitor;
}

export async function deleteVisitor(visitorId: string): Promise<void> {
  const client = getVisitorClient();
  await client.deleteEntity("visitor", visitorId);
}
