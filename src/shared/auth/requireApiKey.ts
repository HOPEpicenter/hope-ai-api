// src/shared/auth/requireApiKey.ts
import { HttpRequest, HttpResponseInit } from "@azure/functions";

/**
 * Expected header: x-api-key
 * Expected env var: HOPE_API_KEY (fallback: API_KEY)
 */
export function requireApiKey(req: HttpRequest): HttpResponseInit | null {
  const expectedKey = process.env.HOPE_API_KEY || process.env.API_KEY;

  if (!expectedKey) {
    return {
      status: 500,
      jsonBody: { error: "Server missing HOPE_API_KEY (or API_KEY) configuration." },
    };
  }

  const providedKey =
    req.headers.get("x-api-key") ||
    req.headers.get("x-functions-key") || // optional fallback if you ever want it
    "";

  if (!providedKey || providedKey !== expectedKey) {
    return { status: 401, jsonBody: { error: "Unauthorized" } };
  }

  return null;
}
