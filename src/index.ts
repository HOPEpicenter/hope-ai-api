 import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";

const TABLE_NAME = "Visitors";
const PARTITION_KEY = "VISITOR";

/** Create a TableClient using STORAGE_CONNECTION_STRING */
function getTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json");
  }
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

/** Ensure the table exists (idempotent) */
async function ensureTableExists(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    // 409 = already exists
    if (err?.statusCode !== 409) throw err;
  }
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

/** API key auth (fail closed if API_KEY isn't set) */
function requireApiKey(req: HttpRequest): HttpResponseInit | null {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    // Fail closed to avoid accidentally exposing your API
    return { status: 500, jsonBody: { error: "Server missing API_KEY configuration." } };
  }

  const providedKey = req.headers.get("x-api-key");
  if (!providedKey || providedKey !== expectedKey) {
    return { status: 401, jsonBody: { error: "Unauthorized" } };
  }

  return null;
}

/**
 * POST /api/visitors
 * Body: { name, email }
 * - New email: 201 { visitorId, alreadyExists:false }
 * - Existing email: 200 { visitorId, alreadyExists:true }
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

    if (!name) return badRequest("Field 'name' is required.");
    if (!rawEmail) return badRequest("Field 'email' is required.");

    const email = normalizeEmail(rawEmail);
    if (!looksLikeEmail(email)) return badRequest("Field 'email' must be a valid email address.");

    const visitorId = uuidv4();
    const createdAt = new Date().toISOString();

    const table = getTableClient();
    await ensureTableExists(table);

    // Enforce uniqueness by RowKey=email
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: email,
      visitorId,
      name,
      email,
      createdAt
    };

    try {
      await table.createEntity(entity);
      context.log(`Visitor created: ${visitorId} (${email})`);
      return { status: 201, jsonBody: { visitorId, alreadyExists: false } };
    } catch (err: any) {
      // Duplicate email -> idempotent success
      if (err?.statusCode === 409) {
        const existing = await table.getEntity<any>(PARTITION_KEY, email);
        const existingVisitorId = existing?.visitorId ?? null;

        context.log(`Duplicate email (idempotent): ${email}`);
        return { status: 200, jsonBody: { visitorId: existingVisitorId, alreadyExists: true } };
      }

      context.error("createVisitor failed", err);
      throw err;
    }
  }
});

/**
 * GET /api/visitors?email=...
 * Returns 200 with { visitorId, name, email, createdAt } or 404
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
          createdAt: existing?.createdAt ?? null
        }
      };
    } catch (err: any) {
      if (err?.statusCode === 404) {
        return { status: 404, jsonBody: { error: "Visitor not found." } };
      }

      context.error("getVisitorByEmail failed", err);
      throw err;
    }
  }
});
  
