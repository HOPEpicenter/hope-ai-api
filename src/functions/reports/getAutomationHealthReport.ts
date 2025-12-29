import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";

function parsePositiveInt(val: string | null, def: number): number {
  const n = val ? parseInt(val, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : def;
}

function num(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

app.http("getAutomationHealthReport", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "reports/automation/health",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const sinceHours = parsePositiveInt(req.query.get("sinceHours"), 72);

    const cs = process.env.STORAGE_CONNECTION_STRING;
    if (!cs) return { status: 500, jsonBody: { ok: false, error: "STORAGE_CONNECTION_STRING is not set" } };

    const runsTableName = process.env.AUTOMATION_RUNS_TABLE || "AutomationRuns";
    const runsTable = makeTableClient(cs, runsTableName);
    await ensureTableExists(runsTable);

    const cutoffIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

    let count = 0;
    let okCount = 0;
    let failedCount = 0;

    let scannedProfiles = 0;
    let eligible = 0;
    let selected = 0;
    let assignedCount = 0;

    let totalDurationMs = 0;
    let durationSamples = 0;

    let latest: any = null;

    // Safe scan with time cutoff on startedAt
    for await (const r of runsTable.listEntities()) {
      const startedAt = (r as any).startedAt as string | undefined;
      if (!startedAt) continue;
      if (startedAt < cutoffIso) continue;

      count++;

      const runOk = (r as any).ok === true;
      if (runOk) okCount++; else failedCount++;

      scannedProfiles += num((r as any).scannedProfiles);
      eligible += num((r as any).eligible);
      selected += num((r as any).selected);
      assignedCount += num((r as any).assignedCount);

      const dur = num((r as any).durationMs);
      if (dur > 0) {
        totalDurationMs += dur;
        durationSamples++;
      }

      if (!latest || startedAt > ((latest as any).startedAt ?? "")) {
        latest = r;
      }
    }

    const avgDurationMs = durationSamples > 0 ? Math.round(totalDurationMs / durationSamples) : null;

    return {
      status: 200,
      jsonBody: {
        ok: true,
        version: 1,
        sinceHours,
        cutoffIso,
        runs: {
          count,
          ok: okCount,
          failed: failedCount,
          latest: latest
            ? {
                automationRunId: (latest as any).automationRunId ?? (latest as any).RowKey ?? null,
                trigger: (latest as any).trigger ?? null,
                ok: (latest as any).ok ?? null,
                dryRun: (latest as any).dryRun ?? null,
                startedAt: (latest as any).startedAt ?? null,
                endedAt: (latest as any).endedAt ?? null,
                durationMs: (latest as any).durationMs ?? null
              }
            : null
        },
        totals: { scannedProfiles, eligible, selected, assignedCount },
        timing: { avgDurationMs }
      }
    };
  }
});

