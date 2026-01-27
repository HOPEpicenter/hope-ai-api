import { TableClient } from "@azure/data-tables";

const VISITOR_TABLE = "devVisitors";

interface VisitorEntity {
  partitionKey: string;
  rowKey: string;
  tagsJson?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export async function addTag(visitorId: string, tag: string) {
  const client = TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );

  // Load entity using the REAL partition key
  const raw = await client.getEntity("visitor", visitorId);
  const entity = raw as unknown as VisitorEntity;

  // Parse tagsJson safely
  const tags: string[] = entity.tagsJson ? JSON.parse(entity.tagsJson) : [];

  if (!tags.includes(tag)) {
    tags.push(tag);
  }

  // Build update object explicitly (NO SPREAD)
  const updated: VisitorEntity = {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    phone: entity.phone,
    status: entity.status,
    notes: entity.notes,
    source: entity.source,
    createdAt: entity.createdAt,
    updatedAt: new Date().toISOString(),
    tagsJson: JSON.stringify(tags)
  };

  await client.updateEntity(updated, "Replace");

  return tags;
}

export async function removeTag(visitorId: string, tag: string) {
  const client = TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );

  const raw = await client.getEntity("visitor", visitorId);
  const entity = raw as unknown as VisitorEntity;

  const tags: string[] = entity.tagsJson ? JSON.parse(entity.tagsJson) : [];
  const updatedTags = tags.filter((t: string) => t !== tag);

  const updated: VisitorEntity = {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    phone: entity.phone,
    status: entity.status,
    notes: entity.notes,
    source: entity.source,
    createdAt: entity.createdAt,
    updatedAt: new Date().toISOString(),
    tagsJson: JSON.stringify(updatedTags)
  };

  await client.updateEntity(updated, "Replace");

  return updatedTags;
}
