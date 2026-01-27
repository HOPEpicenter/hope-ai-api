import { VisitorTask, createTask, listTasks } from "./taskRepository";
import { v4 as uuid } from "uuid";

export interface AutoTaskDefinition {
  code: string;
  label: string;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedChannel: string;
}

export async function autoGenerateTasks(visitorId: string, definitions: AutoTaskDefinition[]) {
  const existing = await listTasks(visitorId);
  const existingCodes = new Set(existing.map(t => t.code));

  const created: VisitorTask[] = [];

  for (const def of definitions) {
    if (existingCodes.has(def.code)) {
      continue;
    }

    const now = new Date().toISOString();
    const taskId = uuid();

    const task: VisitorTask = {
      partitionKey: visitorId,
      rowKey: taskId,
      code: def.code,
      label: def.label,
      reason: def.reason,
      priority: def.priority,
      suggestedChannel: def.suggestedChannel,
      status: "open",
      createdAt: now,
      updatedAt: now
    };

    await createTask(task);
    created.push(task);
  }

  return created;
}
