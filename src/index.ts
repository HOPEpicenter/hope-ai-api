import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";
import sgMail from "@sendgrid/mail";

const TABLE_NAME = "Visitors";
const PARTITION_KEY = "VISITOR";
const ENGAGEMENTS_TABLE = "Engagements";

/** Create a TableClient using STORAGE_CONNECTION_STRING */
function getTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json");
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

/** Ensure the table exists (idempotent) */
async function ensureTableExists(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    if (err?.statusCode !== 409) throw err; // 409 = already exists
  }
}

/** Get Engagements Table */

function getEngagementsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING");
  return TableClient.fromConnectionString(conn, ENGAGEMENTS_TABLE);
}

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

function normalizeEnum(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const s = val.trim().toLowerCase();
  return s ? s : null;
}



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
  // optional allowlist - you can expand anytime
  const allowed = new Set(["website", "qr", "event", "facebook", "instagram", "youtube", "unknown"]);
  return allowed.has(s) ? s : "unknown";
}

/** API key auth (fail closed if API_KEY isn't set) */
function requireApiKey(req: HttpRequest): HttpResponseInit | null {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) return { status: 500, jsonBody: { error: "Server missing API_KEY configuration." } };

  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return { status: 401, jsonBody: { error: "Unauthorized" } };
  }

  return null;
}

/** Parse staff emails from env var (comma-separated) */
function getStaffEmails(): string[] {
  const raw = process.env.STAFF_NOTIFY_EMAILS ?? "";
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/** Send staff notification email (SendGrid) */
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
 * POST /api/visitors
 * Body: { name, email, source? }
 *
 * - New email: 201 { visitorId, alreadyExists:false }
 * - Existing email: 200 { visitorId, alreadyExists:true }
 *
 * Stores entity in Table Storage with:
 * PartitionKey="VISITOR", RowKey=normalizedEmail, plus source
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

    const table = getTableClient();
    await ensureTableExists(table);

    const entity = {
      partitionKey: PARTITION_KEY,
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
        const existing = await table.getEntity<any>(PARTITION_KEY, email);
        const existingVisitorId = existing?.visitorId ?? null;

        return { status: 200, jsonBody: { visitorId: existingVisitorId, alreadyExists: true } };
      }

      context.error("createVisitor failed", err);
      throw err;
    }
  }
});

/**
 * GET /api/visitors?email=...
 * Returns 200 with { visitorId, name, email, createdAt, source } or 404
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

    const table = getTableClient();

    try {
      const existing = await table.getEntity<any>(PARTITION_KEY, email);

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
 * Create Visitors Engagament
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
 * Create Visitors Engagament Status
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

    // We stored occurredAt when creating events; use that as truth
    for await (const e of engagementsTable.listEntities({ queryOptions: { filter } })) {
      count++;
      const occurredAt = (e as any).occurredAt;
      if (typeof occurredAt === "string") {
        if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
      }
    }

    // engaged = any engagement within last 14 days
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
