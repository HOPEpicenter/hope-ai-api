// src/functions/formation/getFormationProfile.ts

import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { ensureVisitorExists } from "../../storage/visitors/visitorsTable";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";

/**
 * Basic 400 helper
 */
function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

/**
 * GET /api/formation/profile
 *
 * Purpose:
 * - Return the current formation profile for a visitor
 * - If no profile exists yet, return profile: null (not an error)
 *
 * Guardrails:
 * - Requires API key
 * - Visitor must exist
 */
export async function getFormationProfile(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const visitorId = (req.query.get("visitorId") ?? "").trim();
  if (!visitorId) {
    return badRequest("Query parameter 'visitorId' is required.");
  }

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    return {
      status: 500,
      jsonBody: { error: "Missing STORAGE_CONNECTION_STRING configuration." },
    };
  }

  try {
    // Guardrail: only operate on real visitors
    await ensureVisitorExists(visitorId);

    const table = getFormationProfilesTableClient(connectionString);
    await ensureTableExists(table);

    // Profiles are keyed by:
    // PartitionKey = "VISITOR"
    // RowKey       = visitorId
    const profile = await table.getEntity<any>("VISITOR", visitorId);

    return {
      status: 200,
      jsonBody: {
        visitorId,
        profile,
      },
    };
  } catch (err: any) {
    // Profile not created yet → return clean null
    if (err?.statusCode === 404) {
      return {
        status: 200,
        jsonBody: {
          visitorId,
          profile: null,
        },
      };
    }

    const status = err?.statusCode ?? 500;
    context.error("getFormationProfile failed", err);

    return {
      status,
      jsonBody: { error: err?.message ?? "Server error" },
    };
  }
}
