// src/index.ts

/**
 * ============================================================================
 *  IMPORTANT: FUNCTION REGISTRATION
 * ============================================================================
 * Azure Functions (Node v4 programming model) only exposes HTTP endpoints that
 * are registered at startup via side-effect imports (modules that call app.http).
 *
 * Keep ALL side-effect imports at the TOP of this file.
 */

// --- Side-effect imports (register app.http / timer triggers) ---
import "./functions/formation/autoAssignFollowupTimer";
import "./functions/formation/index";

import "./functions/getVisitorStatus";
import "./functions/visitors/getVisitorsDashboard";

import "./functions/formation/getFormationProfile";
import "./functions/formation/getFormationFollowupQueue";
import "./functions/formation/postFormationFollowupAction";
import "./functions/formation/postFormationFollowupAutoAssign";
import "./functions/formation/postFormationNextStep";
import "./functions/formation/getFormationSummary";
import "./functions/formation/getFormationFollowupMetrics";
import "./functions/formation/getFormationStageTimeseries";

// ✅ Admin / Ops routes (THIS fixes your 404 for /ops/visitors/...)
import "./functions/admin/getVisitorDashboard";
import "./functions/admin/getVisitorTimeline";

// --- Regular imports (used by code in THIS file) ---
import { tableName } from "./storage/tableName";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { makeTableClient } from "./shared/storage/makeTableClient";
import { v4 as uuidv4 } from "uuid";
import sgMail from "@sendgrid/mail";

import { requireApiKey } from "./shared/auth/requireApiKey";
import { ensureTableExists } from "./shared/storage/ensureTableExists";

import { getVisitorsTableClient, VISITORS_PARTITION_KEY } from "./storage/visitors/visitorsTable";

import { postFormationEvent } from "./functions/formation/postFormationEvent";
import { getFormationEvents } from "./functions/formation/getFormationEvents";

/**
 * ============================================================================
 *  CONFIG
 * ============================================================================
 */

const ENGAGEMENTS_TABLE = "Engagements";

/**
 * ============================================================================
 *  TABLE CLIENTS (Engagements only stays here for now)
 * ============================================================================
 */

/** Create a TableClient using STORAGE_CONNECTION_STRING for Engagements table */
function getEngagementsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error(
      "Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json"
    );
  }
  // IMPORTANT: makeTableClient handles Azurite + allowInsecureConnection correctly
  return makeTableClient(conn, tableName(ENGAGEMENTS_TABLE));
}

/**
 * ============================================================================
 *  GENERAL HELPERS
 * ============================================================================
 */

/** Basic 400 helper */
function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

/** Normalize emails so dedupe works reliably */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lightweight sanity email check */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Normalize "source" string */
function normalizeSource(source: unknown): string {
  if (typeof source !== "string") return "unknown";
  const s = source.trim().toLowerCase();
  if (!s) return "unknown";
  const allowed = new Set(["website", "qr", "event", "facebook", "instagram", "youtube", "unknown"]);
  return allowed.has(s) ? s : "unknown";
}

function normalizeEnum(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const s = val.trim().toLowerCase();
  return s ? s : null;
}

function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * Generate a sortable RowKey for engagement events:
 * YYYYMMDDHHmmssSSS_eventType_random
 */
function makeEngagementRowKey(eventType: string): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    pad(d.getUTCMilliseconds(), 3);

  const rand = Math.random().toString(36).slice(2, 10);
  const safeType = (eventType || "unknown").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `${ts}_${safeType}_${rand}`;
}

function encodeCursor(payload: { t: string; rk: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function tryDecodeCursor(raw: string | null): { t: string; rk: string } | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (obj && typeof obj.t === "string" && typeof obj.rk === "string") return { t: obj.t, rk: obj.rk };
    return null;
  } catch {
    return null;
  }
}

/**
 * ============================================================================
 *  STAFF NOTIFICATION (SENDGRID) - OPTIONAL
 * ============================================================================
 */

/** Parse staff emails from env var (comma-separated) */
function getStaffEmails(): string[] {
  const raw = process.env.STAFF_NOTIFY_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Send staff notification email (SendGrid).
 * Safe behavior: If not configured, do nothing.
 */
async function notifyStaffNewVisitor(params: {
  visitorId: string;
  name: string;
  email: string;
  createdAt: string;
  source: string;
}): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;
  const staffEmails = getStaffEmails();

  // If not configured, do nothing (safe behavior)
  if (!apiKey || !fromEmail || staffEmails.length === 0) return;

  sgMail.setApiKey(apiKey);

  const subject = `New Visitor: ${params.name} (${params.source})`;

  const text = `A new visitor was captured.

Name: ${params.name}
Email: ${params.email}
Source: ${params.source}
VisitorId: ${params.visitorId}
CreatedAt: ${params.createdAt}
`;

  await sgMail.send({
    to: staffEmails,
    from: fromEmail,
    subject,
    text,
  });
}

/**
 * ============================================================================
 *  PHASE 1 — IDENTITY LAYER
 * ============================================================================
 */

/**
 * CREATE VISITOR
 * Route: POST /api/visitors
 */
app.http("createVisitor", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "visitors",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const source = normalizeSource(body?.source);

    if (!name) return badRequest("Field 'name' is required.");
    if (!rawEmail) return badRequest("Field 'email' is required.");

    const email = normalizeEmail(rawEmail);
    if (!looksLikeEmail(email)) return badRequest("Field 'email' must be a valid email address.");

    const visitorId = uuidv4();
    const createdAt = new Date().toISOString();

    const table = getVisitorsTableClient();
    await ensureTableExists(table);

    const entity = {
      partitionKey: VISITORS_PARTITION_KEY,
      rowKey: email, // enforce uniqueness
      visitorId,
      name,
      email,
      createdAt,
      source,
    };

    try {
      await table.createEntity(entity);

      // Email staff ONLY when it's a brand-new visitor
      try {
        await notifyStaffNewVisitor({ visitorId, name, email, createdAt, source });
      } catch (emailErr) {
        context.warn("Staff email notification failed (non-fatal).", emailErr);
      }

      return { status: 201, jsonBody: { visitorId, alreadyExists: false } };
    } catch (err: any) {
      // Duplicate email -> idempotent success (no staff email)
      if (err?.statusCode === 409) {
        const existing = await table.getEntity<any>(VISITORS_PARTITION_KEY, email);
        const existingVisitorId = existing?.visitorId ?? null;

        return { status: 200, jsonBody: { visitorId: existingVisitorId, alreadyExists: true } };
      }

      context.error("createVisitor failed", err);
      throw err;
    }
  },
});

/**
 * GET VISITOR BY EMAIL
 * Route: GET /api/visitors?email=...
 */
app.http("getVisitorByEmail", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const rawEmail = req.query.get("email") ?? "";
    if (!rawEmail) return badRequest("Query parameter 'email' is required.");

    const email = normalizeEmail(rawEmail);
    if (!looksLikeEmail(email)) return badRequest("Query parameter 'email' must be a valid email address.");

    const table = getVisitorsTableClient();

    try {
      const existing = await table.getEntity<any>(VISITORS_PARTITION_KEY, email);

      return {
        status: 200,
        jsonBody: {
          visitorId: existing?.visitorId ?? null,
          name: existing?.name ?? null,
          email: existing?.email ?? email,
          createdAt: existing?.createdAt ?? null,
          source: existing?.source ?? "unknown",
        },
      };
    } catch (err: any) {
      if (err?.statusCode === 404) return { status: 404, jsonBody: { error: "Visitor not found." } };
      context.error("getVisitorByEmail failed", err);
      throw err;
    }
  },
});

/**
 * ============================================================================
 *  PHASE 2 — ENGAGEMENT LAYER (EVENT LOG)
 * ============================================================================
 */

/**
 * CREATE ENGAGEMENT EVENT
 * Route: POST /api/engagements
 */
app.http("createEngagement", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "engagements",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const visitorId = typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
    const eventType = typeof body?.eventType === "string" ? body.eventType.trim() : "";

    if (!visitorId) return badRequest("Field 'visitorId' is required.");
    if (!eventType) return badRequest("Field 'eventType' is required.");

    const channel = normalizeEnum(body?.channel) ?? "unknown";
    const source = normalizeSource(body?.source);
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    let metadata = "";
    if (body?.metadata !== undefined) {
      try {
        metadata = JSON.stringify(body.metadata);
      } catch {
        return badRequest("Field 'metadata' must be valid JSON.");
      }
    }

    const occurredAt = typeof body?.occurredAt === "string" ? body.occurredAt : new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = normalizeEnum(body?.recordedBy) ?? "staff";

    const table = getEngagementsTableClient();
    await ensureTableExists(table);

    const rowKey = makeEngagementRowKey(eventType);

    const entity: any = {
      partitionKey: visitorId,
      rowKey,
      visitorId,
      eventType: eventType.toLowerCase(),
      channel,
      source,
      occurredAt,
      recordedAt,
      recordedBy,
    };

    if (notes) entity.notes = notes;
    if (metadata) entity.metadata = metadata;

    await table.createEntity(entity);

    return { status: 201, jsonBody: { ok: true, engagementId: rowKey } };
  },
});
/**
 * LIST ENGAGEMENT EVENTS (paged)
 * Route: GET /api/engagements?visitorId=...&limit=10&cursor=...&debug=1
 *
 * Cursor is RowKey-only (within a visitorId partition):
 *   cursor = base64url(JSON.stringify({ rk: "<RowKey>" }))
 *
 * Semantics:
 * - First page: newest-first up to limit.
 * - Next page: older items (RowKey < cursor.rk)
 */
app.http("listEngagements", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "engagements",
  handler: async (
    req: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const debugOn =
      req.query.get("debug") === "1" || req.query.get("debug") === "true";

    const limit = parsePositiveInt(req.query.get("limit"), 50);

    const visitorId = (req.query.get("visitorId") ?? "").trim();

    const cursorRaw = (req.query.get("cursor") ?? "").trim();

    const escapeOData = (s: string) => String(s).replace(/'/g, "''");

    const b64urlDecode = (s: string): string => {
      const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
      const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(b64, "base64").toString("utf8");
    };

    const b64urlEncode = (s: string): string => {
      return Buffer.from(s, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
    };

    let cursorDecoded: any = null;
    let cursorRowKey: string | null = null;
    if (cursorRaw) {
      try {
        cursorDecoded = JSON.parse(b64urlDecode(cursorRaw));
        cursorRowKey =
          typeof cursorDecoded?.rk === "string" ? cursorDecoded.rk : null;
      } catch {
        return badRequest("Invalid cursor.");
      }
    }

    // Cursor paging is only supported when visitorId is present (single partition).
    // Without visitorId, Azure Tables ordering is PartitionKey+RowKey, and row-only cursor is ambiguous.
    if (cursorRaw && !visitorId) {
      return badRequest("Cursor paging requires query parameter 'visitorId'.");
    }

    const table = getEngagementsTableClient();
    await ensureTableExists(table);

    const filters: string[] = [];
    if (visitorId) {
      // Engagement rows are stored with partitionKey = visitorId
      filters.push(`PartitionKey eq '${escapeOData(visitorId)}'`);
    }
    if (cursorRowKey) {
      // "older than" cursor (RowKey is sortable)
      filters.push(`RowKey lt '${escapeOData(cursorRowKey)}'`);
    }

    const filter = filters.length ? filters.join(" and ") : undefined;

    // We must return newest-first, but listEntities yields ascending by (PartitionKey, RowKey).
    // Strategy: iterate and keep a rolling window of the last (limit + 1) rows (newest in that partition).
    const window: any[] = [];
    let fetched = 0;

    const iter = table.listEntities<any>(
      filter ? { queryOptions: { filter } } : undefined
    );

    for await (const e of iter) {
      fetched++;

      // normalize entity
      const rowKey = (e as any).rowKey ?? (e as any).RowKey ?? null;
      const pk = (e as any).partitionKey ?? (e as any).PartitionKey ?? null;

      window.push({
        engagementId: rowKey,
        visitorId: (e as any).visitorId ?? pk,
        eventType: (e as any).eventType ?? null,
        channel: (e as any).channel ?? "unknown",
        source: (e as any).source ?? "unknown",
        occurredAt: (e as any).occurredAt ?? null,
        recordedAt: (e as any).recordedAt ?? null,
        recordedBy: (e as any).recordedBy ?? null,
        notes: (e as any).notes ?? "",
        metadata: (() => {
          const m = (e as any).metadata;
          if (!m || typeof m !== "string") return null;
          try {
            return JSON.parse(m);
          } catch {
            return m;
          }
        })(),
      });

      // Keep only last limit+1 (drop oldest)
      if (window.length > limit + 1) {
        window.shift();
      }
    }

    // window now contains the newest (limit+1) rows within filter scope, but still in ascending order.
    // Convert to newest-first and trim to limit.
    const newestFirst = window.slice().reverse();
    const page = newestFirst.slice(0, limit);

    // Compute nextCursor:
    // If we have more than limit in the window, it indicates there are older rows beyond this page.
    // Use the oldest RowKey in the returned page as the boundary for the next request.
    let nextCursor: string | null = null;
    if (window.length > limit && page.length > 0) {
      const oldestReturned = page[page.length - 1]; // because page is newest-first
      if (oldestReturned?.engagementId) {
        nextCursor = b64urlEncode(JSON.stringify({ rk: oldestReturned.engagementId }));
      }
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        visitorId: visitorId || null,
        limit,
        cursor: cursorRaw || null,
        nextCursor,
        count: page.length,
        events: page,
        debug: debugOn
          ? {
              table: (table as any).tableName ?? "Engagements",
              filter: filter ?? null,
              cursorRaw: cursorRaw || null,
              cursorDecoded,
              fetched,
              windowSize: window.length,
              returned: page.length,
            }
          : undefined,
      },
    };
  },
});

/**
 * ============================================================================
 *  PHASE 3.1 — FORMATION (Discover HOPE Pilot)
 * ============================================================================
 */

app.http("postFormationEvent", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "formation/events",
  handler: postFormationEvent,
});

app.http("getFormationEvents", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/events",
  handler: getFormationEvents,
});
