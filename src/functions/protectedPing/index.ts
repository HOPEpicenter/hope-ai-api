import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

function getApiKey(req: HttpRequest): string | undefined {
  return req.headers.get("x-api-key") ?? undefined;
}

function unauthorized(message: string): HttpResponseInit {
  return { status: 401, jsonBody: { ok: false, error: message } };
}

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { ok: false, error: message } };
}

export async function protectedPing(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const expectedApiKey =
    process.env.HOPE_API_KEY ??
    process.env.API_KEY ??
    process.env.X_API_KEY;

  const providedApiKey = getApiKey(req);

  if (!providedApiKey) {
    return unauthorized("Missing x-api-key");
  }

  if (!expectedApiKey) {
    context.warn("protectedPing: no API key env var configured");
    return unauthorized("API key auth is not configured");
  }

  if (providedApiKey !== expectedApiKey) {
    return unauthorized("Invalid x-api-key");
  }

  const rawLimit = req.query.get("limit") ?? "1";
  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit <= 0) {
    return badRequest("Invalid 'limit' (expected positive integer).");
  }

  return {
    status: 200,
    jsonBody: {
      ok: true,
      limit
    }
  };
}

app.http("protectedPing", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "_protected/ping",
  handler: protectedPing
});
