import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { addTag } from "../../repositories/visitorTagsRepository";

export async function addVisitorTag(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const visitorId = request.params.id;
  const body = await request.json() as { tag?: string };

  if (!body.tag) {
    return { status: 400, jsonBody: { error: "tag is required" } };
  }

  const tags = await addTag(visitorId, body.tag);

  return {
    status: 200,
    jsonBody: { tags }
  };
}

app.http("addVisitorTag", {
  methods: ["POST"],
  route: "visitors/{id}/tags",
  authLevel: "anonymous",
  handler: addVisitorTag
});
