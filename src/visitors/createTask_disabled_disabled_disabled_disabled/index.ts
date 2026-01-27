import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { createTask, VisitorTask } from "../../repositories/taskRepository";
import { v4 as uuid } from "uuid";

app.http("createVisitorTask", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "visitors/{visitorId}/tasks",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.visitorId;

      const body = await request.json() as {
        code: string;
        label: string;
        reason: string;
        priority?: "high" | "medium" | "low";
        suggestedChannel?: string;
        status?: string;
      };

      const now = new Date().toISOString();
      const taskId = uuid();

      const task: VisitorTask = {
        partitionKey: visitorId,
        rowKey: taskId,
        code: body.code,
        label: body.label,
        reason: body.reason,
        priority: body.priority ?? "medium",
        suggestedChannel: body.suggestedChannel ?? "call",
        status: (body.status as any) ?? "open",
        createdAt: now,
        updatedAt: now
      };

      await createTask(task);

      return {
        status: 201,
        jsonBody: task
      };
    } catch (err: any) {
      context.log("Error in createVisitorTask:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
