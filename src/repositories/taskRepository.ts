import { TableClient } from "@azure/data-tables";
import { getTableClient } from "../tableClient";

export type TaskStatus =
  | "open"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "snoozed"
  | "dismissed";

export interface VisitorTask {
  partitionKey: string; // visitorId
  rowKey: string;       // taskId
  code: string;
  label: string;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedChannel: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;

  // Assignment fields
  assignedTo?: string;
  assignedRole?: string;
  assignmentNote?: string;
}

/* -------------------------------------------------------
   Ensure table exists
------------------------------------------------------- */
export async function ensureTaskTableExists(): Promise<void> {
  const client = await getTableClient("tasks");
  await client.createTable();
}

/* -------------------------------------------------------
   Create Task
------------------------------------------------------- */
export async function createTask(task: VisitorTask): Promise<void> {
  const client = await getTableClient("tasks");
  await client.createEntity(task);
}

/* -------------------------------------------------------
   List Tasks for a Visitor
------------------------------------------------------- */
export async function listTasks(visitorId: string): Promise<VisitorTask[]> {
  const client = await getTableClient("tasks");

  const entities = client.listEntities<VisitorTask>({
    queryOptions: { filter: `PartitionKey eq '${visitorId}'` }
  });

  const results: VisitorTask[] = [];
  for await (const e of entities) {
    results.push(e);
  }

  results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return results;
}

/* -------------------------------------------------------
   Get Task by ID
------------------------------------------------------- */
export async function getTaskById(
  visitorId: string,
  taskId: string
): Promise<VisitorTask | null> {
  const client = await getTableClient("tasks");
  try {
    const entity = await client.getEntity<VisitorTask>(visitorId, taskId);
    return entity;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------
   Update Task Status
------------------------------------------------------- */
export async function updateTaskStatus(
  visitorId: string,
  taskId: string,
  status: TaskStatus
): Promise<VisitorTask | null> {
  const existing = await getTaskById(visitorId, taskId);
  if (!existing) return null;

  const updated: VisitorTask = {
    ...existing,
    status,
    updatedAt: new Date().toISOString()
  };

  await updateTaskEntity(updated);
  return updated;
}

/* -------------------------------------------------------
   Update Task (generic)
------------------------------------------------------- */
export async function updateTaskEntity(task: VisitorTask): Promise<void> {
  const client = await getTableClient("tasks");
  await client.updateEntity(task, "Replace");
}
