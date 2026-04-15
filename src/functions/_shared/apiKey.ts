export function requireApiKeyForFunction(req: any):
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> } {
  const expected = (process.env.HOPE_API_KEY ?? "").trim();

  if (!expected) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, error: "Server missing HOPE_API_KEY" }
    };
  }

  const headerValue =
    (typeof req?.headers?.get === "function" ? req.headers.get("x-api-key") : null) ??
    (typeof req?.headers?.get === "function" ? req.headers.get("X-API-KEY") : null) ??
    req?.headers?.["x-api-key"] ??
    req?.headers?.["X-API-KEY"] ??
    req?.headers?.["x-api-Key"] ??
    req?.headers?.["X-Api-Key"] ??
    req?.headers?.["x-functions-key"] ??
    req?.headers?.["X-FUNCTIONS-KEY"] ??
    req?.get?.("x-api-key") ??
    req?.get?.("X-API-KEY") ??
    "";

  const actual = String(headerValue ?? "").trim();

  if (!actual) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Missing x-api-key" }
    };
  }

  if (actual !== expected) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Invalid x-api-key" }
    };
  }

  return { ok: true };
}
