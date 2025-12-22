// src/shared/auth/requireApiKey.ts
import { HttpRequest, HttpResponseInit } from "@azure/functions";

/**
 * Expected header: x-api-key
 */
export function requireApiKey(req: HttpRequest): HttpResponseInit | null {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    return {
      status: 500,
      jsonBody: { error: "Server missing API_KEY configuration." },
    };
  }

  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return { status: 401, jsonBody: { error: "Unauthorized" } };
  }
  return null;
}
