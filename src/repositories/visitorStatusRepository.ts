import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";

const STATUS_TABLE = "devVisitorStatusHistory";
const VISITOR_TABLE = "devVisitors";

export interface VisitorStatusEntity {
  partitionKey: string;
  rowKey: string;
  status: string;
  note?: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

function getStatusClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    STATUS_TABLE
  );
}

function getVisitorClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );
}

export async function addStatus(
  visitorId: string,
  status: string,
  note?: string
): Promise<VisitorStatusEntity> {
  const statusClient = getStatusClient();
  const visitorClient = getVisitorClient();

  await statusClient.createTable();
  await visitorClient.createTable();

  const now = new Date().toISOString();
  const statusEventId = uuidv4();

  // 1. Create status history entry
  const entity: VisitorStatusEntity = {
    partitionKey: visitorId,
    rowKey: statusEventId,
    status,
    note,
    timestamp: now,
    createdAt: now,
    updatedAt: now
  };

  await statusClient.createEntity(entity);

  // 2. Load visitor safely
  const rawVisitor = await visitorClient.getEntity("visitor", visitorId);

  // Cast to known shape
  const visitor = rawVisitor as unknown as {
    partitionKey: string;
    rowKey: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    notes?: string;
    source?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    tagsJson?: string;
  };

  // 3. Build clean update object (NO SPREAD)
  const updatedVisitor = {
    partitionKey: visitor.partitionKey,
    rowKey: visitor.rowKey,
    firstName: visitor.firstName,
    lastName: visitor.lastName,
    email: visitor.email,
    phone: visitor.phone,
    notes: visitor.notes,
    source: visitor.source,
    tagsJson: visitor.tagsJson,
    createdAt: visitor.createdAt,
    updatedAt: now,
    status: status
  };

  await visitorClient.updateEntity(updatedVisitor, "Replace");

  return entity;
}

export async function listStatus(
  visitorId: string
): Promise<VisitorStatusEntity[]> {
  const client = getStatusClient();
  await client.createTable();

  const items: VisitorStatusEntity[] = [];

  const iter = client.listEntities<VisitorStatusEntity>({
    queryOptions: {
      filter: `PartitionKey eq '${visitorId}'`
    }
  });

  for await (const entity of iter) {
    items.push(entity as VisitorStatusEntity);
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return items;
}
