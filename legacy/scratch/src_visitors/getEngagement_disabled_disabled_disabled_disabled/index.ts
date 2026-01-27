import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { computeEngagementScore } from "../../repositories/engagementRepository";

app.http("getEngagement", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/engagement",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const result = await computeEngagementScore(visitorId);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getEngagement:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
