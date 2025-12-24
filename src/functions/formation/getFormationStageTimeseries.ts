import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";

function parsePositiveInt(val: string | null, fallback: number, max: number): number {
  if (!val) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m <= 0) return fallback;
  return Math.min(m, max);
}

function dayKey(iso: string): string {
  // YYYY-MM-DD in UTC
  return iso.slice(0, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

function isoDaysAgo(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

app.http("getFormationStageTimeseries", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/stages/timeseries",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    const days = parsePositiveInt(req.query.get("days"), 30, 365);
    const startIso = isoDaysAgo(days - 1); // include today as day 0
    const startDay = dayKey(startIso);
    const endDay = dayKey(isoNow());

    const profilesTable = getFormationProfilesTableClient(connectionString);
    await ensureTableExists(profilesTable as any);

    // Initialize day buckets
    const buckets: Record<string, Record<string, number>> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = dayKey(isoDaysAgo(i));
      buckets[d] = { Visitor: 0, Guest: 0, Connected: 0, Unknown: 0 };
    }

    let profilesScanned = 0;
    let profilesCounted = 0;

    const profileFilter = `PartitionKey eq 'VISITOR'`;

    for await (const p of profilesTable.listEntities({ queryOptions: { filter: profileFilter } })) {
      profilesScanned++;

      const stage = String((p as any)?.stage ?? "").trim() || "Unknown";

      // Prefer explicit stageUpdatedAt; fall back to timestamp
      const updatedAt =
        String((p as any)?.stageUpdatedAt ?? "").trim() ||
        String((p as any)?.timestamp ?? (p as any)?.Timestamp ?? "").trim();

      if (!updatedAt || updatedAt.length < 10) continue;

      const d = dayKey(updatedAt);
      if (!buckets[d]) continue;

      if (buckets[d][stage] == null) buckets[d][stage] = 0;
      buckets[d][stage]++;

      profilesCounted++;
    }

    // Convert to array for charts
    const series = Object.keys(buckets)
      .sort()
      .map((d) => ({
        day: d,
        ...buckets[d]
      }));

    return {
      status: 200,
      jsonBody: {
        generatedAt: isoNow(),
        days,
        range: { startDay, endDay },
        profilesScanned,
        profilesCounted,
        series,
        notes: [
          "Counts represent profile stage updates per day (stageUpdatedAt), not historical population snapshots.",
          "For true daily population by stage, we would need event replay or daily snapshots."
        ]
      }
    };
  }
});
