import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { updateTaskStatus } from "../../repositories/taskRepository";

interface UpdateTaskStatusBody {
  status: "open" | "completed" | "snoozed" | "dismissed";
}

app.http("updateTaskStatus", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "visitors/{id}/tasks/{taskId}/status",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;
      const taskId = request.params.taskId;

      const body = await request.json() as UpdateTaskStatusBody;

      const updated = await updateTaskStatus(visitorId, taskId, body.status);

      if (!updated) {
        return {
          status: 404,
          jsonBody: { error: "Task not found" }
        };
      }

      return {
        status: 200,
        jsonBody: updated
      };
    } catch (err: any) {
      context.log("Error in updateTaskStatus:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
