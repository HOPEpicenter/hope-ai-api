import { TableClient } from "@azure/data-tables";
import { deriveFollowupState } from "../../services/followups/deriveFollowupState";
import { deriveFollowupUrgency } from "../../services/followups/deriveFollowupUrgency";

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

    const tableName = (process.env.FORMATION_PROFILES_TABLE ?? "devFormationProfiles").trim();
    const table = TableClient.fromConnectionString(conn, tableName);

    await ensureTableExists(table);

    const rawLimit = Number(req?.query?.limit ?? 100);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(500, Math.trunc(rawLimit)))
      : 100;

    const queue = String(req?.query?.queue ?? "all").trim();
    const age = String(req?.query?.age ?? "").trim();
    const includeResolved =
      req?.query?.includeResolved === "true" ||
      req?.query?.get?.("includeResolved") === "true";

    const items: any[] = [];

    let actionNeededCount = 0;
    let contactMadeCount = 0;

    const ownersMap: Record<string, number> = {};
    const ownersBuckets: Record<string, { resolved: number; overdue: number; atRisk: number; onTrack: number }> = {};

    const entities = table.listEntities<any>({});

    for await (const p of entities) {
      const assignedTo = String(p.assignedTo ?? "").trim();

      const assignedAt = p.lastFollowupAssignedAt ?? null;
      const contactedAt = p.lastFollowupContactedAt ?? null;
      const outcomeAt = p.lastFollowupOutcomeAt ?? null;
      const outcome = p.lastFollowupOutcome ?? null;

      const assignedAtMs = toMs(assignedAt);
      const contactedAtMs = toMs(contactedAt);

      if (assignedAtMs === null) continue;

      const state = deriveFollowupState(p);
      const followupStatus = state.followupStatus;
      const resolvedForAssignment = followupStatus === "resolved";
      const needsFollowup = state.needsAttention;
      const isContactMade = state.isContactMade;

      if (assignedTo) {
        ownersMap[assignedTo] = (ownersMap[assignedTo] ?? 0) + 1;

        if (!ownersBuckets[assignedTo]) {
          ownersBuckets[assignedTo] = {
            resolved: 0,
            overdue: 0,
            atRisk: 0,
            onTrack: 0
          };
        }

        if (resolvedForAssignment) {
          ownersBuckets[assignedTo].resolved++;
        } else {
          const urgency = deriveFollowupUrgency({
            assignedTo,
            followupStatus,
            lastFollowupAssignedAt: assignedAt
          });

          if (urgency === "OVERDUE") {
            ownersBuckets[assignedTo].overdue++;
          } else if (urgency === "AT_RISK") {
            ownersBuckets[assignedTo].atRisk++;
          } else {
            ownersBuckets[assignedTo].onTrack++;
          }
        }
      }

      if (resolvedForAssignment && !includeResolved) {
        continue;
      }

      // queue filter
      if (queue === "action-needed" && followupStatus !== "action_needed") continue;
      if (queue === "contact-made" && followupStatus !== "contact_made") continue;

      // age filter (state-aware)
      const ageTs =
        followupStatus === "contact_made"
          ? contactedAtMs
          : assignedAtMs;

      if (age === "72h+" && !isOlderThan(72, ageTs)) continue;
      if (age === "48h+" && !isOlderThan(48, ageTs)) continue;
      if (age === "24h+" && !isOlderThan(24, ageTs)) continue;

      if (items.length < limit) {
        // summary counts match returned filtered rows
        if (followupStatus === "action_needed") actionNeededCount++;
        if (followupStatus === "contact_made") contactMadeCount++;

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
    }

    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json",
        "X-HOPE-Surface": "ops-only",
        "X-HOPE-Product-Use": "Use /api/formation/profiles for dashboard/product followup views."
      },
      body: {
        ok: true,
        items,
        summary: {
          open: items.length,
          actionNeeded: actionNeededCount,
          contactMade: contactMadeCount
        },
        owners: Object.entries(ownersMap).map(([ownerId, total]) => {
          const buckets = ownersBuckets[ownerId] ?? {
            resolved: 0,
            overdue: 0,
            atRisk: 0,
            onTrack: 0
          };

          return {
            ownerId,
            total,
            resolved: buckets.resolved,
            overdue: buckets.overdue,
            atRisk: buckets.atRisk,
            onTrack: buckets.onTrack
          };
        })
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

function toMs(v: any): number | null {
  if (!v) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
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

function isOlderThan(hours: number, ts: number | null): boolean {
  if (ts === null) return false;
  return (Date.now() - ts) >= hours * 3600000;
}

