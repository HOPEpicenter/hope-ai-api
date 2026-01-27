import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listTasks } from "../../repositories/taskRepository";

app.http("listTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/tasks/saved",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const tasks = await listTasks(visitorId);

      return {
        status: 200,
        jsonBody: tasks
      };
    } catch (err: any) {
      context.log("Error in listTasks:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
