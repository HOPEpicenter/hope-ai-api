import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { AUTOMATION_RUNS_PARTITION_KEY, getAutomationRunsTableClient } from "../../storage/formation/formationTables";

function getHeader(req: HttpRequest, name: string): string | null {
  const v = req.headers.get(name);
  return v ? String(v) : null;
}

function requireApiKeyLocal(req: HttpRequest): HttpResponseInit | null {
  const expected = process.env.HOPE_API_KEY || process.env.API_KEY;
  if (!expected) {
    return { status: 500, jsonBody: { ok: false, error: "Server missing HOPE_API_KEY (or API_KEY)" } };
  }

  const provided = getHeader(req, "x-api-key");
  if (!provided || provided !== expected) {
    return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
  }

  return null;
}

function parsePositiveIntLocal(v: string | null, def: number): number {
  if (!v) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.floor(n);
  return i > 0 ? i : def;
}

export async function getAutomationMetrics(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const auth = requireApiKeyLocal(req);
  if (auth) return auth;

  const limit = Math.min(parsePositiveIntLocal(req.query.get("limit"), 20), 100);
  const sinceHours = Math.min(parsePositiveIntLocal(req.query.get("sinceHours"), 48), 24 * 90);

  const cutoffIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

  const table = getAutomationRunsTableClient();
  await ensureTableExists(table);

  // NOTE: We intentionally avoid filtering by startedAt in OData.
  // startedAt is a custom string property; filtering on it can be unreliable across SDKs/emulators.
  // Instead: filter by PartitionKey and apply the cutoff in code.
  const filter = `PartitionKey eq '${AUTOMATION_RUNS_PARTITION_KEY}'`;

  const runs: any[] = [];
  let scanned = 0,
    eligible = 0,
    selected = 0,
    assigned = 0,
    failures = 0;

  const softCap = Math.max(limit * 5, 100);

  for await (const e of table.listEntities({ queryOptions: { filter } })) {
    const startedAt = typeof (e as any).startedAt === "string" ? String((e as any).startedAt) : "";
    if (startedAt && startedAt < cutoffIso) continue;

    runs.push({
      automationRunId: (e as any).automationRunId ?? (e as any).rowKey,
      trigger: (e as any).trigger,
      ok: (e as any).ok,
      dryRun: (e as any).dryRun,
      startedAt: (e as any).startedAt,
      endedAt: (e as any).endedAt,
      durationMs: (e as any).durationMs,
      scannedProfiles: (e as any).scannedProfiles,
      eligible: (e as any).eligible,
      selected: (e as any).selected,
      assignedCount: (e as any).assignedCount,
      assigneeId: (e as any).assigneeId,
      windowHours: (e as any).windowHours,
      windowDays: (e as any).windowDays,
      cooldownHours: (e as any).cooldownHours,
      maxResults: (e as any).maxResults,
      force: (e as any).force,
      error: (e as any).error,
    });

    
    // SOFTCAP_BREAK
    if (runs.length >= softCap) break;
scanned += Number((e as any).scannedProfiles ?? 0);
    eligible += Number((e as any).eligible ?? 0);
    selected += Number((e as any).selected ?? 0);
    assigned += Number((e as any).assignedCount ?? 0);
    if ((e as any).ok === false) failures += 1;
  }

  // newest-first by startedAt (ISO string)
  runs.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

  const latest = runs[0] ?? null;

  return {
    status: 200,
    jsonBody: {
      ok: true,
      sinceHours,
      cutoffIso,
      latest,
      totals: {
        runsCount: runs.length,
        failures,
        scannedProfiles: scanned,
        eligible,
        selected,
        assignedCount: assigned,
      },
      runs: runs.slice(0, limit),
      note: runs.length > limit ? `Showing newest ${limit} runs; totals computed from up to ${softCap} runs.` : undefined,
    },
  };
}

app.http("getAutomationMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup/automation/metrics",
  handler: getAutomationMetrics,
});
