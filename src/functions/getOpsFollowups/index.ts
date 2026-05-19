import { TableClient } from "@azure/data-tables";
import { readCanonicalOpsFollowupsNarrative } from "../../services/followups/readCanonicalOpsFollowupsNarrative";
import { normalizeOpsFollowupsQuery, readQueryValue } from "../../services/followups/opsFollowupsQuery";

// Repo pattern: legacy default export invoked as (context, req) via function.json.
export default async function (context: any, req: any): Promise<void> {
  try {
    const expected = (process.env.HOPE_API_KEY ?? "").trim();
    if (!expected) {
      context.res = {
        status: 500,
        body: { ok: false, error: "Server missing HOPE_API_KEY" }
      };
      return;
    }

    const headers = (req?.headers ?? {}) as Record<string, any>;
    const provided =
      (headers["x-api-key"] ??
        headers["X-API-KEY"] ??
        headers["x-api-Key"] ??
        headers["X-Api-Key"] ??
        "") as string;

    if (!provided || String(provided).trim().length === 0) {
      context.res = {
        status: 401,
        body: { ok: false, error: "Missing x-api-key" }
      };
      return;
    }

    if (String(provided).trim() !== expected) {
      context.res = {
        status: 401,
        body: { ok: false, error: "Invalid x-api-key" }
      };
      return;
    }

    const conn = (process.env.STORAGE_CONNECTION_STRING ?? "").trim();
    if (!conn) {
      context.res = {
        status: 500,
        body: { ok: false, error: "Server missing STORAGE_CONNECTION_STRING" }
      };
      return;
    }

    const eventsTableName = (process.env.FORMATION_EVENTS_TABLE ?? "devFormationEvents").trim();
    const profilesTableName = (process.env.FORMATION_PROFILES_TABLE ?? "devFormationProfiles").trim();

    const eventsTable = TableClient.fromConnectionString(conn, eventsTableName);
    const profilesTable = TableClient.fromConnectionString(conn, profilesTableName);

    await ensureTableExists(eventsTable);
    await ensureTableExists(profilesTable);

    const query = normalizeOpsFollowupsQuery({
      limit: readQueryValue(req?.query, "limit"),
      cursor: readQueryValue(req?.query, "cursor"),
      assignedTo: readQueryValue(req?.query, "assignedTo"),
      visitorId: readQueryValue(req?.query, "visitorId"),
      includeResolved: readQueryValue(req?.query, "includeResolved"),
      includeSynthetic: readQueryValue(req?.query, "includeSynthetic"),
      sortBy: readQueryValue(req?.query, "sortBy"),
      sortDir: readQueryValue(req?.query, "sortDir")
    });

    const result = await readCanonicalOpsFollowupsNarrative({
      eventsTable,
      profilesTable,
      limit: query.limit,
      cursor: query.cursor,
      assignedToFilter: query.assignedToFilter,
      visitorIdFilter: query.visitorIdFilter,
      includeResolved: query.includeResolved,
      includeSynthetic: query.includeSynthetic,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });

    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json",
        "X-HOPE-Surface": "ops-only",
        "X-HOPE-Product-Use": "Use /api/formation/profiles for dashboard/product followup views."
      },
      body: {
        ok: true,
        v: 1,
        ...result
      }
    };
  } catch (err: any) {
    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json",
        "X-HOPE-Surface": "ops-only",
        "X-HOPE-Product-Use": "Use /api/formation/profiles for dashboard/product followup views."
      },
      body: { ok: false, error: err?.message ?? "ops_followups_error" }
    };
  }
}


async function ensureTableExists(table: TableClient) {
  try {
    await table.createTable();
  } catch (e: any) {
    const code = e?.statusCode ?? e?.code ?? "";
    if (code === 409 || code === "TableAlreadyExists" || String(code) === "409") {
      return;
    }
    throw e;
  }
}
