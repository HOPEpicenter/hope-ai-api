import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { VisitorRepository } from "../storage/visitorRepository";
import { VisitorUpdateBody } from "../shared/VisitorTypes";

const repo = new VisitorRepository();

export async function updateVisitor(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const id = request.params.id;
  const existing = await repo.getById(id);

  if (!existing) {
    return { status: 404, jsonBody: { error: "Visitor not found" } };
  }

  const body = await request.json() as VisitorUpdateBody;

  const updated = {
    ...existing,
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : existing.tags,
    updatedAt: new Date().toISOString()
  };

  await repo.save(updated);

  return { status: 200, jsonBody: updated };
}

app.http("updateVisitor", {
  methods: ["PATCH"],
  route: "visitors/{id}",
  authLevel: "anonymous",
  handler: updateVisitor
});
