import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listNotes } from "../../repositories/visitorNotesRepository";

export async function getVisitorNotes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const visitorId = request.params.id;

  const notes = await listNotes(visitorId);

  return {
    status: 200,
    jsonBody: notes
  };
}

app.http("getVisitorNotes", {
  methods: ["GET"],
  route: "visitors/{id}/notes",
  authLevel: "anonymous",
  handler: getVisitorNotes
});
