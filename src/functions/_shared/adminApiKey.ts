export function requireAdminApiKeyForFunction(req: any):
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> } {
  const expected = (process.env.HOPE_ADMIN_API_KEY ?? "").trim();

  if (!expected) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        error: "Server missing HOPE_ADMIN_API_KEY"
      }
    };
  }

  const headerValue =
    (typeof req?.headers?.get === "function"
      ? req.headers.get("x-admin-api-key")
      : null) ??
    (typeof req?.headers?.get === "function"
      ? req.headers.get("X-ADMIN-API-KEY")
      : null) ??
    req?.headers?.["x-admin-api-key"] ??
    req?.headers?.["X-ADMIN-API-KEY"] ??
    req?.get?.("x-admin-api-key") ??
    req?.get?.("X-ADMIN-API-KEY") ??
    "";

  const actual = String(headerValue ?? "").trim();

  if (!actual) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Missing x-admin-api-key"
      }
    };
  }

  if (actual !== expected) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        error: "Invalid x-admin-api-key"
      }
    };
  }

  return { ok: true };
}
