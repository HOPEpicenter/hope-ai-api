import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";

const TABLE_NAME = "Visitors";
const PARTITION_KEY = "VISITOR";

function getTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("Missing STORAGE_CONNECTION_STRING in App Settings / local.settings.json");
  }
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

async function ensureTableExists(client: TableClient): Promise<void> {
  try {
    await client.createTable();
  } catch (err: any) {
    if (err?.statusCode !== 409) throw err; // 409 = already exists
  }
}

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Simple email sanity check (not perfect, but good enough)
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.http("createVisitor", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "visitors",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
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

    // Enforce uniqueness by using RowKey = normalized email
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
      return { status: 201, jsonBody: { visitorId } };
    } catch (err: any) {
      // 409 = entity already exists => duplicate email
      if (err?.statusCode === 409) {
        const existing = await table.getEntity<any>(PARTITION_KEY, email);
        const existingVisitorId = existing?.visitorId ?? null;

        context.log(`Duplicate email prevented: ${email} -> ${existingVisitorId}`);
        return {
          status: 409,
          jsonBody: {
            error: "Email already exists.",
            visitorId: existingVisitorId
          }
        };
      }
      throw err;
    }
  }
});
