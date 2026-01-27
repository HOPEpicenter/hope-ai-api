import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { removeTag } from "../../repositories/visitorTagsRepository";

export async function removeVisitorTag(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const visitorId = request.params.id;
  const tag = request.params.tag;

  const tags = await removeTag(visitorId, tag);

  return {
    status: 200,
    jsonBody: { tags }
  };
}

app.http("removeVisitorTag", {
  methods: ["DELETE"],
  route: "visitors/{id}/tags/{tag}",
  authLevel: "anonymous",
  handler: removeVisitorTag
});
