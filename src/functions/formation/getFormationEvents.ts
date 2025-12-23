// src/functions/formation/getFormationEvents.ts

import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { ensureVisitorExists } from "../../storage/visitors/visitorsTable";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Remove Azure Tables odata fields and return staff-friendly shape.
 */
function toPublicEvent(e: any) {
  const metadataRaw = e?.metadata;
  let metadata: any = null;

  if (typeof metadataRaw === "string" && metadataRaw.trim()) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      metadata = metadataRaw;
    }
  }

  return {
    eventId: e?.rowKey ?? null,
    visitorId: e?.partitionKey ?? e?.visitorId ?? null,
    type: e?.type ?? null,
    occurredAt: e?.occurredAt ?? null,
    recordedAt: e?.recordedAt ?? null,
    channel: e?.channel ?? null,
    visibility: e?.visibility ?? null,
    sensitivity: e?.sensitivity ?? null,
    summary: e?.summary ?? "",
    metadata,
  };
}

/**
 * GET /api/formation/events?visitorId=...&limit=50
 *
 * Purpose:
 * - Return formation event timeline for a visitor
 * - Newest-first (based on RowKey sort)
 *
 * Guardrails:
 * - Requires API key
 * - Visitor must exist
 */
export async function getFormationEvents(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const visitorId = (req.query.get("visitorId") ?? "").trim();
  if (!visitorId) return badRequest("Query parameter 'visitorId' is required.");

  const limit = Math.min(parsePositiveInt(req.query.get("limit"), 50), 200);

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING configuration." } };
  }

  try {
    await ensureVisitorExists(visitorId);

    const table = getFormationEventsTableClient(connectionString);
    await ensureTableExists(table);

    // Events table is keyed by:
    // PartitionKey = visitorId
    // RowKey       = ISO timestamp + random suffix (sortable)
    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    const items: any[] = [];
    for await (const e of table.listEntities({ queryOptions: { filter } })) {
      items.push(e);
    }

    // Newest-first based on rowKey (which begins with ISO timestamp)
    items.sort((a, b) => ((a as any).rowKey < (b as any).rowKey ? 1 : -1));

    const events = items.slice(0, limit).map(toPublicEvent);

    return {
      status: 200,
      jsonBody: {
        visitorId,
        count: events.length,
        limit,
        events,
      },
    };
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    context.error("getFormationEvents failed", err);
    return { status, jsonBody: { error: err?.message ?? "Server error" } };
  }
}
