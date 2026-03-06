export async function protectedPing(context: any, req: any): Promise<void> {
  try {
    const expectedApiKey =
      process.env.HOPE_API_KEY ??
      process.env.API_KEY ??
      process.env.X_API_KEY;

    const providedApiKey =
      req?.headers?.["x-api-key"] ??
      req?.headers?.["X-Api-Key"] ??
      req?.headers?.["X-API-KEY"] ??
      req?.headers?.["x-api_key"] ??
      req?.headers?.["X-Api_Key"];

    if (!providedApiKey) {
      context.res = {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "Missing x-api-key" }
      };
      return;
    }

    if (!expectedApiKey) {
      context.log?.warn?.("protectedPing: no API key env var configured");
      context.res = {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "API key auth is not configured" }
      };
      return;
    }

    if (String(providedApiKey) !== String(expectedApiKey)) {
      context.res = {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "Invalid x-api-key" }
      };
      return;
    }

    const rawLimit = (req?.query?.limit ?? "1").toString();
    const limit = Number(rawLimit);

    if (!Number.isInteger(limit) || limit <= 0) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "Invalid 'limit' (expected positive integer)." }
      };
      return;
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, limit }
    };
  } catch (err: any) {
    context.log?.error?.(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}
