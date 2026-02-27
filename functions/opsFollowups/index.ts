import type { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { getFormationProfilesTableClient } from "../../src/storage/formation/formationTables";
import { ensureTableExists } from "../../src/shared/storage/ensureTableExists";

function pickHeader(req: HttpRequest): string {
  const h: any = (req as any).headers ?? {};
  const v =
    h["x-api-key"] ??
    h["X-API-KEY"] ??
    h["x-api-Key"] ??
    h["X-Api-Key"];
  return typeof v === "string" ? v : "";
}

function toMs(v: any): number | null {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  try {
    const expected = (process.env.HOPE_API_KEY ?? "").trim();
    if (!expected) {
      context.res = { status: 500, body: { ok: false, error: "Server missing HOPE_API_KEY" } };
      return;
    }

    const provided = pickHeader(req).trim();
    if (!provided) {
      context.res = { status: 401, body: { ok: false, error: "Missing x-api-key" } };
      return;
    }
    if (provided !== expected) {
      context.res = { status: 401, body: { ok: false, error: "Invalid x-api-key" } };
      return;
    }

    const table = getFormationProfilesTableClient();
    await ensureTableExists(table);

    const items: any[] = [];

    for await (const p of table.listEntities<any>({})) {
      const assignedTo = String((p as any).assignedTo ?? "").trim();
      if (!assignedTo) continue;

      const assignedAt = (p as any).lastFollowupAssignedAt ?? null;
      const contactedAt = (p as any).lastFollowupContactedAt ?? null;
      const outcomeAt = (p as any).lastFollowupOutcomeAt ?? null;

      const assignedAtMs = toMs(assignedAt);
      const contactedAtMs = toMs(contactedAt);
      const outcomeAtMs = toMs(outcomeAt);

      const resolvedForAssignment =
        assignedAtMs !== null && outcomeAtMs !== null && outcomeAtMs >= assignedAtMs;

      // Mirror current ops route behavior: hide resolved rows from queue view
      if (resolvedForAssignment) continue;

      const needsFollowup =
        contactedAtMs === null ||
        (assignedAtMs !== null && contactedAtMs !== null && assignedAtMs > contactedAtMs);

      items.push({
        visitorId: String((p as any).rowKey ?? (p as any).RowKey ?? ""),
        assignedTo: { ownerType: "user", ownerId: assignedTo },
        lastFollowupAssignedAt: assignedAt,
        lastFollowupContactedAt: contactedAt,
        lastFollowupOutcomeAt: outcomeAt,
        resolvedForAssignment,
        stage: (p as any).stage ?? null,
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
};

export default httpTrigger;
