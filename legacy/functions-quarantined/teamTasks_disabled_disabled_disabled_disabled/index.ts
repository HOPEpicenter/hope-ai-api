import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getTasksForRole } from "../repositories/taskQueryRepository";

app.http("teamTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks/team",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const role = request.query.get("role") ?? undefined;

      if (!role) {
        return {
          status: 400,
          jsonBody: { error: "role is required" }
        };
      }

      const tasks = await getTasksForRole(role);

      const membersMap = new Map<string, { assignedToId?: string; assignedToName?: string; count: number; highPriority: number }>();

      for (const t of tasks) {
        const key = t.assignedToId ?? t.assignedToName ?? "unlabeled";
        const existing = membersMap.get(key) ?? {
          assignedToId: t.assignedToId,
          assignedToName: t.assignedToName,
          count: 0,
          highPriority: 0
        };
        existing.count += 1;
        if (t.priority === "high") existing.highPriority += 1;
        membersMap.set(key, existing);
      }

      const members = Array.from(membersMap.values());

      return {
        status: 200,
        jsonBody: {
          assignedRole: role,
          total: tasks.length,
          members,
          tasks
        }
      };
    } catch (err: any) {
      context.log("Error in teamTasks:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
