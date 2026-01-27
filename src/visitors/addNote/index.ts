import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { addNote } from "../../repositories/visitorNotesRepository";

export async function addVisitorNote(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const visitorId = request.params.id;
  const body = await request.json() as { content?: string };
  const content = body.content;

  if (!content) {
    return { status: 400, jsonBody: { error: "content is required" } };
  }

  const note = await addNote(visitorId, content);

  return {
    status: 201,
    jsonBody: note
  };
}

app.http("addVisitorNote", {
  methods: ["POST"],
  route: "visitors/{id}/notes",
  authLevel: "anonymous",
  handler: addVisitorNote
});
