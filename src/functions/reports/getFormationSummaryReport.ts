import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getWindowRangeUtc } from "../../shared/time/reportTime";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../../storage/formation/formationTables";

type Stage = "Visitor" | "Guest" | "Connected" | "Unknown";

function parsePositiveInt(val: string | null, def: number): number {
  const n = val ? parseInt(val, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function safeStage(v: any): Stage {
  if (v === "Visitor" || v === "Guest" || v === "Connected") return v;
  return "Unknown";
}

app.http("getFormationSummaryReport", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "reports/formation/summary",
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

    const counts: Record<Stage, number> = {
      Visitor: 0,
      Guest: 0,
      Connected: 0,
      Unknown: 0
    };

    let profilesScanned = 0;

    for await (const p of profiles.listEntities({ queryOptions: { filter: "PartitionKey eq 'VISITOR'" } })) {
      profilesScanned++;
      counts[safeStage((p as any).stage)]++;
    }

    let eventsInWindow = 0;
    let toConnected = 0;

    const filter =
      "PartitionKey eq 'VISITOR' and occurredAt ge '" +
      range.startIso +
      "' and occurredAt lt '" +
      range.endIso +
      "'";

    for await (const e of events.listEntities({ queryOptions: { filter } })) {
      eventsInWindow++;
      if ((e as any).type === "FOLLOWUP_OUTCOME_RECORDED" && (e as any).outcome === "CONNECTED") {
        toConnected++;
      }
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        version: 1,
        windowDays,
        range,
        currentStageCounts: counts,
        advancementsInWindow: { toConnected },
        totals: { profilesScanned, eventsInWindow }
      }
    };
  }
});


