import { TableClient } from "@azure/data-tables";
import { v4 as uuid } from "uuid";

const NOTES_TABLE = "devVisitorNotes";

// Strong typing for notes returned from Azure Table Storage
interface VisitorNote {
  partitionKey: string;
  rowKey: string;
  content: string;
  createdAt: string;
}

export async function addNote(visitorId: string, content: string) {
  const client = TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    NOTES_TABLE
  );

  const id = uuid();

  const entity: VisitorNote = {
    partitionKey: visitorId,
    rowKey: id,
    content,
    createdAt: new Date().toISOString()
  };

  await client.createEntity(entity);

  return entity;
}

export async function listNotes(visitorId: string) {
  const client = TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    NOTES_TABLE
  );

  const notes: VisitorNote[] = [];

  for await (const note of client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${visitorId}'`
    }
  })) {
    // Cast each returned entity to our VisitorNote type
    const typed = note as unknown as VisitorNote;
    notes.push(typed);
  }

  // Sort newest → oldest
  notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return notes;
}
