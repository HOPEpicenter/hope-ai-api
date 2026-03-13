import { TableClient } from "@azure/data-tables";

// Avoid depending on @azure/functions legacy type exports.
// The runtime will call this default export with (context, req).
export default async function (context: any, req: any): Promise<void> {
  try {
    const expected = (process.env.HOPE_API_KEY ?? "").trim();
    if (!expected) {
      context.res = { status: 500, body: { ok: false, error: "Server missing HOPE_API_KEY" } };
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
      context.res = { status: 401, body: { ok: false, error: "Missing x-api-key" } };
      return;
    }
    if (String(provided).trim() !== expected) {
      context.res = { status: 401, body: { ok: false, error: "Invalid x-api-key" } };
      return;
    }

    const conn = (process.env.STORAGE_CONNECTION_STRING ?? "").trim();
    if (!conn) {
      context.res = { status: 500, body: { ok: false, error: "Server missing STORAGE_CONNECTION_STRING" } };
      return;
    }

    // NOTE: This table name must match your formation profiles table.
    // If your actual table name differs, change it here once, and dashboard will work.
    const tableName = (process.env.FORMATION_PROFILES_TABLE ?? "devFormationProfiles").trim();
    const table = TableClient.fromConnectionString(conn, tableName);

    await ensureTableExists(table);

    const items: any[] = [];

    const entities = table.listEntities<any>({});

    for await (const p of entities) {
      const assignedTo = String(p.assignedTo ?? "").trim();

      const assignedAt = p.lastFollowupAssignedAt ?? null;
      const contactedAt = p.lastFollowupContactedAt ?? null;
      const outcomeAt = p.lastFollowupOutcomeAt ?? null;
      const outcome = p.lastFollowupOutcome ?? null;

      const assignedAtMs = toMs(assignedAt);
      const contactedAtMs = toMs(contactedAt);
      const outcomeAtMs = toMs(outcomeAt);

      if (assignedAtMs === null) continue;

      const resolvedForAssignment =
        outcomeAtMs !== null && outcomeAtMs >= assignedAtMs;

      // Match ops route: omit resolved rows from queue view
      if (resolvedForAssignment) continue;

      const needsFollowup =
        contactedAtMs === null ||
        (contactedAtMs !== null && assignedAtMs > contactedAtMs);

      items.push({
        visitorId: String(p.rowKey ?? ""),
        assignedTo: assignedTo ? { ownerType: "user", ownerId: assignedTo } : null,
        lastFollowupAssignedAt: assignedAt,
        lastFollowupContactedAt: contactedAt,
        lastFollowupOutcomeAt: outcomeAt,
        lastFollowupOutcome: outcome,
        resolvedForAssignment,
        stage: p.stage ?? null,
        needsFollowup
      });
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { ok: true, items }
    };
  } catch (err: any) {
    context.res = {
      status: 500,
      headers: { "content-type": "application/json" },
      body: { ok: false, error: err?.message ?? "ops_followups_error" }
    };
  }
}

function toMs(v: any): number | null {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

async function ensureTableExists(table: TableClient) {
  try {
    await table.createTable();
  } catch (e: any) {
    // 409 conflict => already exists
    const code = e?.statusCode ?? e?.code ?? "";
    if (code === 409 || code === "TableAlreadyExists") return;
    // Some SDK versions throw RestError with statusCode
    if (String(code) === "409") return;
    throw e;
  }
}



