import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";
import sgMail from "@sendgrid/mail";

/**
 * ============================================================================
 *  CONFIG
 * ============================================================================
 */
const VISITORS_TABLE = "Visitors";
const ENGAGEMENTS_TABLE = "Engagements";
const VISITORS_PARTITION_KEY = "VISITOR";

/**
 * ============================================================================
 *  TABLE CLIENTS + STORAGE HELPERS
 * ============================================================================
 */

/** Create a TableClient using STORAGE_CONNECTION_STRING for Visitors table */
function getVisitorsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json");
  return TableClient.fromConnectionString(conn, VISITORS_TABLE);
}

/** Create a TableClient using STORAGE_CONNECTION_STRING for Engagements table */
function getEngagementsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json");
  return TableClient.fromConnectionString(conn, ENGAGEMENTS_TABLE);
}

/** Ensure a table exists (idempotent). 409 = already exists. */
async function ensureTableExists(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    if (err?.statusCode !== 409) throw err;
  }
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

/**
 * ============================================================================
 *  SECURITY
 * ============================================================================
 */

/**
 * API key auth (fail closed if API_KEY isn't set)
 * Expected header: x-api-key
 */
function requireApiKey(req: HttpRequest): HttpResponseInit | null {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) return { status: 500, jsonBody: { error: "Server missing API_KEY configuration." } };

  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return { status: 401, jsonBody: { error: "Unauthorized" } };
  }
  return null;
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
    .map(s => s.trim())
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

  const text =
`A new visitor was captured.

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
    text
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
 * Method(s): POST
 *
 * Purpose:
 * - Capture a new visitor identity
 * - Enforce idempotency via normalized email
 * - Generate visitorId on first insert
 *
 * Auth:
 * - Requires x-api-key
 *
 * Storage:
 * - Table: Visitors
 * - PartitionKey = "VISITOR"
 * - RowKey = normalized email
 *
 * Behavior:
 * - New email: 201 { visitorId, alreadyExists:false }
 * - Existing email: 200 { visitorId, alreadyExists:true }
 *
 * Notes:
 * - Sends staff email only for brand-new visitors (if SendGrid configured)
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
      source
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
  }
});

/**
 * GET VISITOR BY EMAIL
 * Route: GET /api/visitors?email=...
 * Method(s): GET
 *
 * Purpose:
 * - Lookup visitor identity by email
 *
 * Auth:
 * - Requires x-api-key
 *
 * Storage:
 * - Table: Visitors
 * - PartitionKey = "VISITOR"
 * - RowKey = normalized email
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
          source: existing?.source ?? "unknown"
        }
      };
    } catch (err: any) {
      if (err?.statusCode === 404) return { status: 404, jsonBody: { error: "Visitor not found." } };
      context.error("getVisitorByEmail failed", err);
      throw err;
    }
  }
});

/**
 * ============================================================================
 *  PHASE 2 — ENGAGEMENT LAYER (EVENT LOG)
 * ============================================================================
 */

/**
 * CREATE ENGAGEMENT EVENT
 * Route: POST /api/engagements
 * Method(s): POST
 *
 * Purpose:
 * - Record a single engagement action tied to a visitor (append-only event log)
 *
 * Auth:
 * - Requires x-api-key
 *
 * Storage:
 * - Table: Engagements
 * - PartitionKey = visitorId
 * - RowKey = sortable timestamp + eventType + random
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
      recordedBy
    };

    if (notes) entity.notes = notes;
    if (metadata) entity.metadata = metadata;

    await table.createEntity(entity);

    return { status: 201, jsonBody: { ok: true, engagementId: rowKey } };
  }
});

/**
 * LIST ENGAGEMENT EVENTS
 * Route: GET /api/engagements?visitorId=...
 * Method(s): GET
 *
 * Purpose:
 * - Return engagement timeline for a visitor
 *
 * Auth:
 * - Requires x-api-key
 *
 * Notes:
 * - Returns newest-first (sorted by engagementId / RowKey)
 */
app.http("listEngagements", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "engagements",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorId = (req.query.get("visitorId") ?? "").trim();
    if (!visitorId) return badRequest("Query parameter 'visitorId' is required.");

    const table = getEngagementsTableClient();
    await ensureTableExists(table);

    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    const events: any[] = [];
    for await (const e of table.listEntities({ queryOptions: { filter } })) {
      events.push({
        engagementId: e.rowKey,
        visitorId: e.partitionKey,
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
          try { return JSON.parse(m); } catch { return m; }
        })()
      });
    }

    events.sort((a, b) => (a.engagementId < b.engagementId ? 1 : -1));
    return { status: 200, jsonBody: { visitorId, events } };
  }
});

/**
 * ============================================================================
 *  PHASE 2.1 — ENGAGEMENT STATUS
 * ============================================================================
 */

/**
 * GET VISITOR ENGAGEMENT STATUS
 * Route: GET /api/visitors/status?visitorId=...
 * Method(s): GET
 *
 * Purpose:
 * - Determine if a visitor is currently "engaged"
 *
 * Auth:
 * - Requires x-api-key
 *
 * Definition:
 * - engaged = at least one engagement event in the last 14 days
 */
app.http("getVisitorStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/status",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorId = (req.query.get("visitorId") ?? "").trim();
    if (!visitorId) return badRequest("Query parameter 'visitorId' is required.");

    const engagementsTable = getEngagementsTableClient();
    await ensureTableExists(engagementsTable);

    const filter = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

    let lastEngagedAt: string | null = null;
    let count = 0;

    for await (const e of engagementsTable.listEntities({ queryOptions: { filter } })) {
      count++;
      const occurredAt = (e as any).occurredAt;
      if (typeof occurredAt === "string") {
        if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
      }
    }

    const windowDays = 14;
    let engaged = false;
    let daysSinceLastEngagement: number | null = null;

    if (lastEngagedAt) {
      const last = new Date(lastEngagedAt).getTime();
      const now = Date.now();
      const diffMs = now - last;
      daysSinceLastEngagement = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      engaged = diffMs <= windowDays * 24 * 60 * 60 * 1000;
    }

    return {
      status: 200,
      jsonBody: {
        visitorId,
        engaged,
        lastEngagedAt,
        daysSinceLastEngagement,
        engagementCount: count,
        windowDays
      }
    };
  }
});

/**
 * ============================================================================
 *  PHASE 2.2 — FOLLOW-UP OPERATIONS
 * ============================================================================
 */

/**
 * LIST VISITORS NEEDING FOLLOW-UP
 * Route: GET /api/visitors/needs-followup?windowHours=48&maxResults=50
 * Method(s): GET
 *
 * Purpose:
 * - Provide staff with an action list for follow-up
 *
 * Auth:
 * - Requires x-api-key
 *
 * Definition:
 * - needs follow-up if last engagement is older than windowHours OR no engagement exists
 *
 * Notes:
 * - This scans Visitors and checks Engagements per visitorId
 * - Suitable for small to moderate volume (Phase 2)
 */
app.http("listVisitorsNeedsFollowup", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/needs-followup",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const windowHours = parsePositiveInt(req.query.get("windowHours"), 48);
    const maxResults = parsePositiveInt(req.query.get("maxResults"), 50);

    const now = Date.now();
    const cutoffMs = now - windowHours * 60 * 60 * 1000;

    const visitorsTable = getVisitorsTableClient();
    await ensureTableExists(visitorsTable);

    const engagementsTable = getEngagementsTableClient();
    await ensureTableExists(engagementsTable);

    const filterVisitors = `PartitionKey eq '${VISITORS_PARTITION_KEY}'`;

    const results: any[] = [];

    for await (const v of visitorsTable.listEntities({ queryOptions: { filter: filterVisitors } })) {
      if (results.length >= maxResults) break;

      const visitorId = (v as any).visitorId as string | undefined;
      if (!visitorId) continue;

      const createdAt = (v as any).createdAt as string | undefined;
      const name = (v as any).name as string | undefined;
      const email = (v as any).email as string | undefined;
      const source = (v as any).source as string | undefined;

      const filterEng = `PartitionKey eq '${visitorId.replace(/'/g, "''")}'`;

      let lastEngagedAt: string | null = null;
      let engagementCount = 0;

      for await (const e of engagementsTable.listEntities({ queryOptions: { filter: filterEng } })) {
        engagementCount++;
        const occurredAt = (e as any).occurredAt;
        if (typeof occurredAt === "string") {
          if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
        }
      }

      const lastMs = lastEngagedAt ? new Date(lastEngagedAt).getTime() : null;
      const needsFollowup = !lastMs || lastMs < cutoffMs;
      if (!needsFollowup) continue;

      results.push({
        visitorId,
        name: name ?? "",
        email: email ?? "",
        source: source ?? "unknown",
        createdAt: createdAt ?? null,
        lastEngagedAt,
        hoursSinceLastEngagement: lastMs ? Math.floor((now - lastMs) / (1000 * 60 * 60)) : null,
        engagementCount
      });
    }

    return {
      status: 200,
      jsonBody: {
        windowHours,
        count: results.length,
        visitors: results
      }
    };
  }
});
