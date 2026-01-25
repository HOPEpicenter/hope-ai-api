const { TableClient } = require("@azure/data-tables");

const conn = process.env.STORAGE_CONNECTION_STRING;
if (!conn) {
  console.error("Missing STORAGE_CONNECTION_STRING");
  process.exit(1);
}

const keep = new Set(JSON.parse(process.env.KEEP_IDS || "[]"));

const tables = [
  { name: "Visitors", mode: "visitors" },
  { name: "Engagements", mode: "engagements" },
  { name: "FormationProfiles", mode: "profiles" },
  { name: "FormationEvents", mode: "events" },
];

function getVid(mode, e) {
  if (mode === "visitors") return String(e.visitorId ?? "");
  if (mode === "engagements") return String(e.partitionKey ?? e.PartitionKey ?? "");
  if (mode === "profiles") return String(e.rowKey ?? e.RowKey ?? e.visitorId ?? "");
  if (mode === "events") return String(e.partitionKey ?? e.PartitionKey ?? e.visitorId ?? "");
  return "";
}

function getPk(e) { return String(e.partitionKey ?? e.PartitionKey ?? ""); }
function getRk(e) { return String(e.rowKey ?? e.RowKey ?? ""); }

(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const summary = {};

  for (const t of tables) {
    const client = TableClient.fromConnectionString(conn, t.name);
    let scanned = 0, deleted = 0, kept = 0;

    for await (const e of client.listEntities()) {
      scanned++;

      const vid = getVid(t.mode, e);
      if (!vid || keep.has(vid)) {
        kept++;
        continue;
      }

      const pk = getPk(e);
      const rk = getRk(e);
      if (!pk || !rk) continue;

      if (!dryRun) {
        await client.deleteEntity(pk, rk);
      }
      deleted++;
    }

    summary[t.name] = { scanned, kept, deleted, dryRun };
  }

  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
