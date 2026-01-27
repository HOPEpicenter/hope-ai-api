import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getFollowUpTasks } from "../../repositories/followUpTaskRepository";

app.http("getFollowUpTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/tasks",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const result = await getFollowUpTasks(visitorId);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getFollowUpTasks:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
