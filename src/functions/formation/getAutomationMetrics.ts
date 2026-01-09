import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAutomationRunsTableClient, AUTOMATION_RUNS_PARTITION_KEY } from "../../storage/formation/formationTables";

function requireApiKeyInline(req: HttpRequest): HttpResponseInit | null {
  const provided =
    req.headers.get("x-api-key") ??
    req.headers.get("X-Api-Key") ??
    req.headers.get("X-API-KEY") ??
    "";

  const expected = process.env.HOPE_API_KEY ?? "";

  if (!expected) {
    // Misconfig: no key configured
    return { status: 500, jsonBody: { ok: false, error: "HOPE_API_KEY missing in environment" } };
  }

  if (!provided || provided !== expected) {
    return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
  }

  return null;
}

function parsePositiveInt(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

type RunDto = {
  automationRunId: string;

  trigger?: string;
  ok?: boolean;
  dryRun?: boolean;

  startedAt?: string;
  endedAt?: string;
  durationMs?: number;

  scannedProfiles?: number;
  eligible?: number;
  selected?: number;
  assignedCount?: number;

  assigneeId?: string;
  windowHours?: number;
  windowDays?: number;
  cooldownHours?: number;
  maxResults?: number;
  force?: boolean;

  error?: string;
};

export async function getAutomationMetrics(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = requireApiKeyInline(req);
  if (auth) return auth;

  try {
    const sinceHours = parsePositiveInt(req.query.get("sinceHours"), 48);
    const cutoffMs = Date.now() - sinceHours * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const table = getAutomationRunsTableClient();

    const filter = `PartitionKey eq '${escapeOdataString(
      AUTOMATION_RUNS_PARTITION_KEY
    )}' and startedAt ge '${escapeOdataString(cutoffIso)}'`;

    const rows: RunDto[] = [];

    for await (const e of table.listEntities<any>({ queryOptions: { filter } })) {
      rows.push({
        automationRunId: String(e.rowKey ?? e.RowKey ?? ""),

        trigger: e.trigger,
        ok: e.ok,
        dryRun: e.dryRun ?? false,

        startedAt: e.startedAt,
        endedAt: e.endedAt ?? null,
        durationMs: typeof e.durationMs === "number" ? e.durationMs : null,

        scannedProfiles: typeof e.scannedProfiles === "number" ? e.scannedProfiles : 0,
        eligible: typeof e.eligible === "number" ? e.eligible : 0,
        selected: typeof e.selected === "number" ? e.selected : 0,
        assignedCount: typeof e.assignedCount === "number" ? e.assignedCount : 0,

        assigneeId: e.assigneeId ?? null,
        windowHours: typeof e.windowHours === "number" ? e.windowHours : null,
        windowDays: typeof e.windowDays === "number" ? e.windowDays : null,
        cooldownHours: typeof e.cooldownHours === "number" ? e.cooldownHours : null,
        maxResults: typeof e.maxResults === "number" ? e.maxResults : null,
        force: typeof e.force === "boolean" ? e.force : null,

        error: e.error ?? null,
      });

      if (rows.length >= 100) break;
    }

    // newest first
    rows.sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));

    const newest20 = rows.slice(0, 20);
    const latest = newest20[0] ?? null;

    const totals = rows.reduce(
      (acc, r) => {
        acc.runsCount += 1;
        if (r.ok === false) acc.failures += 1;
        acc.scannedProfiles += Number(r.scannedProfiles ?? 0);
        acc.eligible += Number(r.eligible ?? 0);
        acc.selected += Number(r.selected ?? 0);
        acc.assignedCount += Number(r.assignedCount ?? 0);
        return acc;
      },
      { runsCount: 0, failures: 0, scannedProfiles: 0, eligible: 0, selected: 0, assignedCount: 0 }
    );

    return {
      status: 200,
      jsonBody: {
        ok: true,
        sinceHours,
        cutoffIso,
        latest,
        totals,
        runs: newest20,
        note: "Showing newest 20 runs; totals computed from up to 100 runs.",
      },
    };
  } catch (err: any) {
    context.error("getAutomationMetrics failed", err?.message ?? err);
    return { status: 500, jsonBody: { ok: false, error: String(err?.message ?? err) } };
  }
}

app.http("getAutomationMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup/automation/metrics",
  handler: getAutomationMetrics,
});
