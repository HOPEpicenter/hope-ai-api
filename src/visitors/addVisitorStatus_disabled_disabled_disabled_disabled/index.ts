import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { addStatus } from "../../repositories/visitorStatusRepository";

app.http("addVisitorStatus", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "visitors/{id}/status",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const visitorId = request.params.id;

      // Strict‑mode safe: cast the body to a known shape
      const body = (await request.json()) as { status?: string; note?: string };

      const status = body.status;
      const note = body.note;

      if (!status || typeof status !== "string") {
        return {
          status: 400,
          jsonBody: { error: "Field 'status' is required and must be a string." }
        };
      }

      const entity = await addStatus(visitorId, status, note);

      return {
        status: 201,
        jsonBody: entity
      };
    } catch (err: any) {
      context.log("Error in addVisitorStatus:", err);
      return {
        status: 500,
        jsonBody: { error: "Internal Server Error" }
      };
    }
  }
});
