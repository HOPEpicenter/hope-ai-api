/* scripts/cleanupAutomationRuns.js */
const { TableClient } = require("@azure/data-tables");

function envStr(name, fallback) {
  const v = process.env[name];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

async function main() {
  const connectionString = envStr("STORAGE_CONNECTION_STRING", "");
  if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

  const tableName = envStr("AUTOMATION_RUNS_TABLE", "devAutomationRuns");
  const dryRun = envBool("CLEANUP_DRY_RUN", true);

  console.log(JSON.stringify({ tableName, dryRun }, null, 2));

  // IMPORTANT: Azurite uses http; the SDK blocks it unless explicitly allowed.
  const table = TableClient.fromConnectionString(connectionString, tableName, {
    allowInsecureConnection: true,
  });

  let scanned = 0;
  let flagged = 0;
  let deleted = 0;

  for await (const e of table.listEntities()) {
    scanned++;

    const pk = e.partitionKey;
    const rk = e.rowKey;

    const assigneeId = (e.assigneeId ?? "").toString();
    const windowHours = typeof e.windowHours === "number" ? e.windowHours : Number(e.windowHours ?? NaN);
    const maxResults = typeof e.maxResults === "number" ? e.maxResults : Number(e.maxResults ?? NaN);
    const durationMs = typeof e.durationMs === "number" ? e.durationMs : Number(e.durationMs ?? NaN);

    const badEmptyRowKey = (rk ?? "").toString().trim().length === 0;

    const badUnknownZero =
      assigneeId === "unknown" &&
      (Number.isFinite(windowHours) ? windowHours === 0 : true) &&
      (Number.isFinite(maxResults) ? maxResults === 0 : true);

    const badNegativeDuration = Number.isFinite(durationMs) && durationMs < 0;

    if (!badEmptyRowKey && !badUnknownZero && !badNegativeDuration) continue;

    flagged++;
    const reason = [
      badEmptyRowKey ? "empty-rowKey" : null,
      badUnknownZero ? "unknown-zero-config" : null,
      badNegativeDuration ? "negative-duration" : null,
    ]
      .filter(Boolean)
      .join(",");

    console.log(`[FLAG] pk=${pk} rk=${rk} reason=${reason}`);

    if (!dryRun) {
      await table.deleteEntity(pk, rk);
      deleted++;
    }
  }

  console.log(JSON.stringify({ scanned, flagged, deleted }, null, 2));
}

main().catch((err) => {
  console.error("cleanupAutomationRuns failed:", err?.message ?? err);
  process.exit(1);
});
