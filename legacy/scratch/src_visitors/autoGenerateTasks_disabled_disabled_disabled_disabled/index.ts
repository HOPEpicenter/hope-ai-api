import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { autoGenerateTasks } from "../../repositories/autoTaskRepository";

app.http("autoGenerateTasksForVisitor", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "visitors/{visitorId}/tasks/auto-generate",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.visitorId;

      const body = await request.json() as {
        definitions?: {
          code: string;
          label: string;
          reason: string;
          priority: "high" | "medium" | "low";
          suggestedChannel: string;
        }[];
      };

      const definitions = body.definitions ?? [];

      const created = await autoGenerateTasks(visitorId, definitions);

      return {
        status: 200,
        jsonBody: {
          visitorId,
          created,
          skipped: []
        }
      };
    } catch (err: any) {
      context.log("Error in autoGenerateTasksForVisitor:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
