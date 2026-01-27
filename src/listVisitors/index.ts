import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { makeTableClient } from "../shared/storage/makeTableClient";
import { tableName } from "../storage/tableName";

function normalizeTags(raw: any): string[] {
  if (!raw) return [];

  // If Azure returned {}, treat as empty
  if (typeof raw === "object" && Object.keys(raw).length === 0) return [];

  // If already an array
  if (Array.isArray(raw)) return raw;

  // If stored as JSON string
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

app.http("listVisitors", {
  methods: ["GET"],
  route: "visitors",
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const status = req.query.get("status");
    const campus = req.query.get("campus");
    const tag = req.query.get("tag");

    const page = parseInt(req.query.get("page") ?? "1", 10);
    const pageSize = parseInt(req.query.get("pageSize") ?? "25", 10);

    const client = makeTableClient(
      process.env.AzureWebJobsStorage!,
      tableName("visitors")
    );

    const entities = client.listEntities();

    const filtered: any[] = [];
    for await (const entity of entities) {
      const tags = normalizeTags(entity.tags);

      if (status && entity.status !== status) continue;
      if (campus && entity.campus !== campus) continue;
      if (tag && !tags.includes(tag)) continue;

      filtered.push(entity);
    }

    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return {
      status: 200,
      jsonBody: {
        page,
        pageSize,
        total: filtered.length,
        results: paged
      }
    };
  }
});
