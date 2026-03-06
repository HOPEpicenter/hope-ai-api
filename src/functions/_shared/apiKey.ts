export function requireApiKeyForFunction(req: any):
  | { ok: true }
  | { ok: false; status: number; body: any } {
  const expected = (process.env.HOPE_API_KEY ?? "").trim();

  if (!expected) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, error: "API key auth is not configured" }
    };
  }

  const provided =
    String(
      req?.headers?.["x-api-key"] ??
      req?.headers?.["X-Api-Key"] ??
      req?.headers?.["x-api-Key"] ??
      ""
    ).trim();

  if (!provided) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Missing x-api-key" }
    };
  }

  if (provided !== expected) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: "Invalid x-api-key" }
    };
  }

  return { ok: true };
}
