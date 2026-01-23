import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getTasksForAssignee } from "../repositories/taskQueryRepository";

app.http("myTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks/my",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const assignedToId = request.query.get("assignedToId") ?? undefined;
      const assignedToEmail = request.query.get("assignedToEmail") ?? undefined;

      if (!assignedToId && !assignedToEmail) {
        return {
          status: 400,
          jsonBody: { error: "assignedToId or assignedToEmail is required" }
        };
      }

      const tasks = await getTasksForAssignee(assignedToId, assignedToEmail);

      const highPriority = tasks.filter(t => t.priority === "high").length;
      const mediumPriority = tasks.filter(t => t.priority === "medium").length;
      const lowPriority = tasks.filter(t => t.priority === "low").length;

      const summary = {
        assignedToId,
        assignedToEmail,
        assignedToName: tasks[0]?.assignedToName,
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
      context.log("Error in myTasks:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
