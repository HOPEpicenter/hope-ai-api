import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDashboard } from "../../repositories/dashboardRepository";

app.http("getDashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/dashboard",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const result = await getDashboard(visitorId);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getDashboard:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
