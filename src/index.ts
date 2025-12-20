import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { v4 as uuidv4 } from "uuid";

const TABLE_NAME = "Visitors";

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
    // 409 = table already exists
    if (err?.statusCode !== 409) throw err;
  }
}

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
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
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!name) return badRequest("Field 'name' is required.");
    if (!email) return badRequest("Field 'email' is required.");

    const visitorId = uuidv4();
    const createdAt = new Date().toISOString();

    const table = getTableClient();
    await ensureTableExists(table);

    // Azure Tables require PartitionKey + RowKey
    const entity = {
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId,
      name,
      email,
      createdAt
    };

    await table.createEntity(entity);

    context.log(`Visitor created: ${visitorId}`);

    return {
      status: 201,
      jsonBody: { visitorId }
    };
  }
});
