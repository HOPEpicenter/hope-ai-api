import { TableClient } from "@azure/data-tables";
import { getTableClient } from "../tableClient";
import { listVisitors } from "./visitorRepository";
import { VisitorTask } from "./taskRepository";

type OpenStatus = Exclude<VisitorTask["status"], "completed" | "cancelled" | "dismissed">;

export interface TaskWithVisitor {
  taskId: string;
  visitorId: string;
  visitorName: string;
  email?: string;
  phone?: string;
  tags: string[];
  priority: VisitorTask["priority"];
  status: VisitorTask["status"];
  code: string;
  label: string;
  reason: string;
  suggestedChannel: string;
  createdAt: string;
  updatedAt: string;
  assignedToId?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedRole?: string;
}

function sortByPriorityAndCreatedAt(a: TaskWithVisitor, b: TaskWithVisitor): number {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const pa = order[a.priority] ?? 3;
  const pb = order[b.priority] ?? 3;
  if (pa !== pb) return pa - pb;
  return a.createdAt.localeCompare(b.createdAt);
}

async function getAllOpenTasks(): Promise<VisitorTask[]> {
  const client: TableClient = await getTableClient("tasks");

  const entities = client.listEntities<VisitorTask>();
  const results: VisitorTask[] = [];

  for await (const e of entities) {
    if (e.status === "completed" || e.status === "cancelled" || e.status === "dismissed") continue;
    results.push(e);
  }

  return results;
}

async function attachVisitorInfo(tasks: VisitorTask[]): Promise<TaskWithVisitor[]> {
  const visitors = await listVisitors();
  const visitorMap = new Map<string, any>();
  for (const v of visitors) visitorMap.set(v.rowKey, v);

  const enriched: TaskWithVisitor[] = tasks.map(t => {
    const v = visitorMap.get(t.partitionKey);
    const visitorName = v ? `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim() || v.rowKey : t.partitionKey;
    const email = v?.email;
    const phone = v?.phone;
    const tags: string[] = Array.isArray(v?.tags) ? v.tags : [];

    const anyTask = t as any;

    return {
      taskId: t.rowKey,
      visitorId: t.partitionKey,
      visitorName,
      email,
      phone,
      tags,
      priority: t.priority,
      status: t.status,
      code: t.code,
      label: t.label,
      reason: t.reason,
      suggestedChannel: t.suggestedChannel,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignedToId: anyTask.assignedToId,
      assignedToEmail: anyTask.assignedToEmail,
      assignedToName: anyTask.assignedToName ?? anyTask.assignedTo,
      assignedRole: anyTask.assignedRole
    };
  });

  enriched.sort(sortByPriorityAndCreatedAt);
  return enriched;
}

export async function getTasksForAssignee(
  assignedToId?: string,
  assignedToEmail?: string
): Promise<TaskWithVisitor[]> {
  const allOpen = await getAllOpenTasks();

  const filtered = allOpen.filter(t => {
    const anyTask = t as any;
    const idMatch = assignedToId && anyTask.assignedToId === assignedToId;
    const emailMatch = assignedToEmail && anyTask.assignedToEmail === assignedToEmail;
    return idMatch || emailMatch;
  });

  return attachVisitorInfo(filtered);
}

export async function getTasksForRole(role: string): Promise<TaskWithVisitor[]> {
  const allOpen = await getAllOpenTasks();

  const filtered = allOpen.filter(t => {
    const anyTask = t as any;
    return anyTask.assignedRole === role;
  });

  return attachVisitorInfo(filtered);
}

export async function getUnassignedTasks(): Promise<TaskWithVisitor[]> {
  const allOpen = await getAllOpenTasks();

  const filtered = allOpen.filter(t => {
    const anyTask = t as any;
    const hasId = !!anyTask.assignedToId;
    const hasEmail = !!anyTask.assignedToEmail;
    const hasName = !!anyTask.assignedTo;
    return !hasId && !hasEmail && !hasName;
  });

  return attachVisitorInfo(filtered);
}
