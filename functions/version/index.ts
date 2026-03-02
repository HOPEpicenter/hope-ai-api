import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function version(_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  // Keep response stable + cheap. Enrich later if needed.
  return {
    status: 200,
    jsonBody: {
      ok: true,
      service: "hope-ai-api",
      // If you already have a shared version helper, swap to that (minimal change now).
      version: process.env.npm_package_version ?? "unknown"
    }
  };
}

app.http("version", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "version",
  handler: version
});
