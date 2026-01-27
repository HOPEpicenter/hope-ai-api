import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDailyDashboard } from "../../repositories/pastoralDashboardRepository";

app.http("getDailyDashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/daily",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorsParam = request.query.get("visitors");

      if (!visitorsParam) {
        return {
          status: 400,
          jsonBody: { error: "Query parameter 'visitors' is required (comma-separated visitor IDs)." }
        };
      }

      const visitorIds = visitorsParam.split(",").map(v => v.trim()).filter(v => v.length > 0);

      const dashboard = await getDailyDashboard(visitorIds);

      return {
        status: 200,
        jsonBody: dashboard
      };
    } catch (err: any) {
      context.log("Error in getDailyDashboard:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
