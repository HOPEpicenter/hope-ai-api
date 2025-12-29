import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { REPORT_TZ, getRecentWeekBucketsUtc } from "../../shared/time/reportTime";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../../storage/formation/formationTables";
import { buildFollowupQueue } from "../../domain/formation/buildFollowupQueue";

type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

function parsePositiveInt(val: string | null, def: number): number {
  const n = val ? parseInt(val, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function isInWindow(occurredAtIso: string | undefined, startIso: string, endIso: string): boolean {
  if (!occurredAtIso) return false;
  return occurredAtIso >= startIso && occurredAtIso < endIso;
}

app.http("getWeeklyTrendsReport", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "reports/trends/weekly",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const weeks = parsePositiveInt(req.query.get("weeks"), 8);

    const cs = process.env.STORAGE_CONNECTION_STRING;
    if (!cs) return { status: 500, jsonBody: { ok: false, error: "STORAGE_CONNECTION_STRING is not set" } };

    const profiles = getFormationProfilesTableClient(cs);
    const events = getFormationEventsTableClient(cs);

    await ensureTableExists(profiles);
    await ensureTableExists(events);

    const buckets = getRecentWeekBucketsUtc(weeks);

    // Preload all events once (safe for now; optimize later with server-side filters)
    const allEvents: any[] = [];
    for await (const e of events.listEntities()) {
      allEvents.push(e);
    }

    const series = [];

    for (const b of buckets) {
      const startIso = b.weekStartIso;
      const endIso = b.weekEndIso;

      let followupsAssigned = 0;
      let outcomesRecorded = 0;

      for (const e of allEvents) {
        const type = (e as any).type as string | undefined;
        const occurredAt = ((e as any).occurredAt ?? (e as any).OccurredAt ?? (e as any).timestamp) as string | undefined;
        if (!isInWindow(occurredAt, startIso, endIso)) continue;

        if (type === "FOLLOWUP_ASSIGNED") followupsAssigned++;
        if (type === "FOLLOWUP_OUTCOME_RECORDED") outcomesRecorded++;
      }

      // Overdue at week end: evaluate queue at endIso (exclusive boundary).
      // We use 1ms before endIso so it lands inside the week.
      const weekEndInstant = new Date(new Date(endIso).getTime() - 1);

      const rows = await buildFollowupQueue({
        profilesTable: profiles,
        now: weekEndInstant,
        limit: 10000,
      });

      const overdueAtWeekEnd = rows.filter(r => r.urgency === "OVERDUE").length;

      series.push({
        weekStartLocal: b.weekStartLocal,
        weekStartIso: startIso,
        weekEndIso: endIso,
        followupsAssigned,
        outcomesRecorded,
        overdueAtWeekEnd,
      });
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        version: 1,
        weeks,
        timezone: REPORT_TZ,
        series,
      },
    };
  },
});

