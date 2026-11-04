import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const endpoints = [
  "getOpsFollowups",
  "getOpsTaskPreviewSimulation",
  "getOpsTaskPreviewSummary"
];

for (const endpoint of endpoints) {
  const file = path.resolve(
    __dirname,
    "../../src/functions",
    endpoint,
    "index.ts"
  );

  const source = fs.readFileSync(file, "utf8");

  assert.doesNotMatch(
    source,
    /TableClient\.fromConnectionString\s*\(/
  );

  assert.equal(
    (source.match(/getHopeTableClient\((?:eventsTableName|profilesTableName)\)/g) ?? []).length,
    2,
    `${endpoint}: expected two managed-identity-aware clients`
  );

  assert.match(
    source,
    /if \(!conn && process\.env\.HOPE_TABLE_AUTH_MODE\?\.trim\(\) !== "managed-identity"\)/
  );

  assert.match(source, /Server missing STORAGE_CONNECTION_STRING/);

  assert.match(
    source,
    /getTableClient as getHopeTableClient/
  );

  const authCheck = source.indexOf(
    "String(provided).trim() !== expected"
  );

  const storageCheck = source.indexOf(
    "if (!conn &&"
  );

  const clientConstruction = source.indexOf(
    "getHopeTableClient(eventsTableName)"
  );

  assert.ok(authCheck >= 0);
  assert.ok(storageCheck > authCheck);
  assert.ok(clientConstruction > storageCheck);
}

console.log("opsTableAuthModeContract.test.ts passed");