import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getWindowRangeUtc } from "../../shared/time/reportTime";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../../storage/formation/formationTables";
import { buildFollowupQueue } from "../../domain/formation/buildFollowupQueue";

function parsePositiveInt(val: string | null, def: number): number {
  const n = val ? parseInt(val, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function isInWindow(occurredAtIso: string | undefined, startIso: string, endIso: string): boolean {
  if (!occurredAtIso) return false;
  return occurredAtIso >= startIso && occurredAtIso < endIso;
}

app.http("getFollowupOpsReport", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "reports/followups/ops",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const windowDays = parsePositiveInt(req.query.get("windowDays"), 7);
    const range = getWindowRangeUtc(windowDays);

    const cs = process.env.STORAGE_CONNECTION_STRING;
    if (!cs) {
      return { status: 500, jsonBody: { ok: false, error: "STORAGE_CONNECTION_STRING is not set" } };
    }

    const profiles = getFormationProfilesTableClient(cs);
    const events = getFormationEventsTableClient(cs);

    await ensureTableExists(profiles);
    await ensureTableExists(events);

    // 1) Event counts in window (safe scan; can be optimized once schema is confirmed)
    let assigned = 0;
    let contacted = 0;
    let outcomeRecorded = 0;

    for await (const e of events.listEntities()) {
      const type = (e as any).type as string | undefined;
      const occurredAt = ((e as any).occurredAt ?? (e as any).OccurredAt ?? (e as any).timestamp) as string | undefined;

      if (!isInWindow(occurredAt, range.startIso, range.endIso)) continue;

      if (type === "FOLLOWUP_ASSIGNED") assigned++;
      else if (type === "FOLLOWUP_CONTACTED") contacted++;
      else if (type === "FOLLOWUP_OUTCOME_RECORDED") outcomeRecorded++;
    }

    // 2) Current open/urgency snapshot (reuses computeFromProfile via helper)
        const rows = await buildFollowupQueue({
      profilesTable: profiles,
      now: new Date(),
      limit: 5000,
    });

    const urgencyNow = { OVERDUE: 0, DUE_SOON: 0, WATCH: 0 } as Record<"OVERDUE"|"DUE_SOON"|"WATCH", number>;
    for (const r of rows) {
      urgencyNow[r.urgency] = (urgencyNow[r.urgency] ?? 0) + 1;
    }
    const openNow = rows.length;
return {
      status: 200,
      jsonBody: {
        ok: true,
        version: 1,
        windowDays,
        range,
        events: { assigned, contacted, outcomeRecorded },
        clearance: { openNow },
        urgencyNow,
        totals: { profilesScanned: null },
      },
    };
  },
});



