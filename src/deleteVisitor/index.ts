import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeTableClient } from "../shared/storage/makeTableClient";
import { tableName } from "../storage/tableName";

app.http("deleteVisitor", {
  methods: ["DELETE"],
  route: "visitors/{id}",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const id = req.params.id;

    if (!id) {
      return {
        status: 400,
        jsonBody: { error: "Missing visitor ID" }
      };
    }

    try {
      const client = makeTableClient(
        process.env.AzureWebJobsStorage!,
        tableName("visitors")
      );

      await client.deleteEntity("visitor", id);

      return {
        status: 204
      };
    } catch (err: any) {
      if (err.statusCode === 404) {
        return {
          status: 404,
          jsonBody: { error: "Visitor not found" }
        };
      }

      ctx.error("DELETE error", err);

      return {
        status: 500,
        jsonBody: { error: "Failed to delete visitor" }
      };
    }
  }
});
