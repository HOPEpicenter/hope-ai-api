import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { VisitorRepository } from "../storage/visitorRepository";
import { v4 as uuid } from "uuid";

const repo = new VisitorRepository();

export async function createVisitor(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("=== CREATE VISITOR START ===");

  try {
    let body: any = null;

    try {
      body = await request.json();
      context.log("Parsed body:", body);
    } catch (err) {
      context.error("Failed to parse JSON body:", err);
      return {
        status: 400,
        jsonBody: { error: "Invalid JSON body" }
      };
    }

    if (!body?.firstName || !body?.lastName || !body?.email) {
      context.error("Missing required fields:", body);
      return {
        status: 400,
        jsonBody: { error: "firstName, lastName, and email are required." }
      };
    }

    const now = new Date().toISOString();

    const visitor = {
      id: uuid(),
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone ?? "",
      status: "new",
      tags: [],
      notes: "",
      source: body.source ?? "",
      createdAt: now,
      updatedAt: now
    };

    context.log("Visitor object constructed:", visitor);

    await repo.save(visitor);
    context.log("Visitor saved successfully");

    return {
      status: 201,
      jsonBody: visitor
    };

  } catch (err: any) {
    context.error("CREATE VISITOR ERROR:", err);

    return {
      status: 500,
      jsonBody: {
        error: "Internal server error",
        detail: err?.message ?? "Unknown error"
      }
    };
  }
}

app.http("createVisitor", {
  methods: ["POST"],
  route: "visitors",
  authLevel: "anonymous",
  handler: createVisitor
});
