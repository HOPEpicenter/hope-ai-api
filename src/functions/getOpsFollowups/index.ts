import { TableClient } from "@azure/data-tables";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { buildOpsFollowupsQueue } from "../../services/followups/buildOpsFollowupsQueue";

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

    const limit = parsePositiveInt(req?.query?.limit, 25, 100);
    const cursor = parseNonNegativeInt(req?.query?.cursor, 0);

    const includeResolved =
      String(readQuery(req, "includeResolved") ?? "").trim().toLowerCase() === "true";

    const engagementService = new EngagementsService(new EngagementEventsRepository());

    const result = await buildOpsFollowupsQueue({
      eventsTable,
      profilesTable,
      engagementService,
      limit,
      cursor,
      assignedToFilter: String(readQuery(req, "assignedTo") ?? "").trim(),
      visitorIdFilter: String(readQuery(req, "visitorId") ?? "").trim(),
      includeResolved,
      sortBy: String(readQuery(req, "sortBy") ?? "").trim(),
      sortDir: String(readQuery(req, "sortDir") ?? "").trim().toLowerCase() === "asc" ? "asc" : "desc",
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

function readQuery(req: any, name: string): any {
  const value = req?.query?.[name];
  if (Array.isArray(value)) return value[0];
  if (value !== undefined) return value;

  if (typeof req?.query?.get === "function") {
    return req.query.get(name);
  }

  return undefined;
}

function parsePositiveInt(value: any, fallback: number, max: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function parseNonNegativeInt(value: any, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
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
