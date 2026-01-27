import { getTaskById, updateTaskEntity } from "./taskRepository";

export interface TaskAssignmentRequest {
  assignedTo: string;
  assignedRole?: string;
  assignmentNote?: string;
}

export async function assignTask(
  visitorId: string,
  taskId: string,
  payload: TaskAssignmentRequest
) {
  const existing = await getTaskById(visitorId, taskId);
  if (!existing) {
    throw new Error("Task not found");
  }

  const updated = {
    ...existing,
    assignedTo: payload.assignedTo,
    assignedRole: payload.assignedRole,
    assignmentNote: payload.assignmentNote,
    updatedAt: new Date().toISOString()
  };

  await updateTaskEntity(updated);
  return updated;
}

export async function clearAssignment(visitorId: string, taskId: string) {
  const existing = await getTaskById(visitorId, taskId);
  if (!existing) {
    throw new Error("Task not found");
  }

  const updated = {
    ...existing,
    assignedTo: undefined,
    assignedRole: undefined,
    assignmentNote: undefined,
    updatedAt: new Date().toISOString()
  };

  await updateTaskEntity(updated);
  return updated;
}
