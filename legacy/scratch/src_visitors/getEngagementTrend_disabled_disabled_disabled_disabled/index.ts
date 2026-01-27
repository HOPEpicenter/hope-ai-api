import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getEngagementTrend } from "../../repositories/engagementTrendRepository";

app.http("getEngagementTrend", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/engagement/trend",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const result = await getEngagementTrend(visitorId);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getEngagementTrend:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
