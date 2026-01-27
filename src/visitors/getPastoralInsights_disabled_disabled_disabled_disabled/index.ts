import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getPastoralInsights } from "../../repositories/pastoralInsightsRepository";

app.http("getPastoralInsights", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/insights",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      const result = await getPastoralInsights(visitorId);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getPastoralInsights:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
