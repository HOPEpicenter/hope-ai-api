import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getJourney } from "../../repositories/journeyRepository";

app.http("getJourney", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/journey",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;
      const orderParam = request.query.get("order");
      const order = orderParam === "desc" ? "desc" : "asc";

      const result = await getJourney(visitorId, order);

      return {
        status: 200,
        jsonBody: result
      };
    } catch (err: any) {
      context.log("Error in getJourney:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
