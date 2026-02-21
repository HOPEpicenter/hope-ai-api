import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getUnassignedTasks } from "../repositories/taskQueryRepository";

app.http("unassignedTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks/unassigned",
  handler: async (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const tasks = await getUnassignedTasks();

      const highPriority = tasks.filter(t => t.priority === "high").length;
      const mediumPriority = tasks.filter(t => t.priority === "medium").length;
      const lowPriority = tasks.filter(t => t.priority === "low").length;

      const summary = {
        total: tasks.length,
        highPriority,
        mediumPriority,
        lowPriority
      };

      return {
        status: 200,
        jsonBody: {
          summary,
          tasks
        }
      };
    } catch (err: any) {
      context.log("Error in unassignedTasks:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
