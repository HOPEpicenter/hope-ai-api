import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listStatus } from "../../repositories/visitorStatusRepository";

app.http("getVisitorStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/{id}/status",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      // Correct way for Azure Functions v4 (URLSearchParams)
      const limitParam = request.query.get("limit");
      const sinceParam = request.query.get("since");
      const statusParam = request.query.get("status");

      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const since = sinceParam ? new Date(sinceParam) : undefined;
      const statusFilter = statusParam ? statusParam.toLowerCase() : undefined;

      const items = await listStatus(visitorId);

      let filtered = items;

      // 1. Filter by status
      if (statusFilter) {
        filtered = filtered.filter(e => e.status.toLowerCase() === statusFilter);
      }

      // 2. Filter by since date
      if (since && !isNaN(since.getTime())) {
        filtered = filtered.filter(e => new Date(e.timestamp) >= since);
      }

      // 3. Apply limit
      if (limit && limit > 0) {
        filtered = filtered.slice(0, limit);
      }

      return {
        status: 200,
        jsonBody: filtered
      };
    } catch (err: any) {
      context.log("Error in getVisitorStatus:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
