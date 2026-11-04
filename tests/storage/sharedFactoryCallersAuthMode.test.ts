import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const names = [
  "HOPE_TABLE_AUTH_MODE",
  "HOPE_TABLE_ENDPOINT",
  "HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID",
  "STORAGE_CONNECTION_STRING",
  "AzureWebJobsStorage"
] as const;

const previous = names.map((name) => process.env[name]);

const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";

function readSource(relative: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../", relative),
    "utf8"
  );
}

try {
  for (const name of names) delete process.env[name];

  process.env.HOPE_TABLE_AUTH_MODE = "managed-identity";
  process.env.HOPE_TABLE_ENDPOINT = endpoint;
  process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = clientId;

  const tables = require("../../src/storage/formation/formationTables");
  const profiles = require("../../src/storage/formation/formationProfileStore");
  const visitors = require("../../src/storage/visitors/visitorsTable");

  const constructed = [
    tables.getFormationEventsTableClient(),
    tables.getFormationProfilesTableClient(),
    tables.getAutomationRunsTableClient(),
    profiles.getFormationProfilesTableClient(""),
    visitors.getVisitorsTableClient()
  ];

  for (const client of constructed) {
    assert.equal(client.url, endpoint);
  }

  // An inherited legacy string must not override selected identity mode.
  process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

  assert.equal(
    tables.getFormationEventsTableClient(
      "UseDevelopmentStorage=true"
    ).url,
    endpoint
  );

  assert.equal(
    profiles.getFormationProfilesTableClient(
      "UseDevelopmentStorage=true"
    ).url,
    endpoint
  );

  assert.equal(visitors.getVisitorsTableClient().url, endpoint);

  // Automation runs is tested statically: no write or cleanup executed.
  const automationSource = readSource(
    "src/storage/formation/automationRunsRepo.ts"
  );

  assert.match(
    automationSource,
    /HOPE_TABLE_AUTH_MODE/
  );

  assert.match(
    automationSource,
    /return makeTableClient/
  );

  assert.equal(
    (automationSource.match(
      /if \(!connectionString && !\(/g
    ) ?? []).length,
    2
  );

  // Preserve connection-string defaults when mode is absent.
  delete process.env.HOPE_TABLE_AUTH_MODE;

  const legacy = tables.getFormationEventsTableClient(
    "UseDevelopmentStorage=true"
  );

  assert.ok(legacy);
  assert.equal(legacy.tableName, tables.FORMATION_EVENTS_TABLE);

  delete process.env.STORAGE_CONNECTION_STRING;

  assert.throws(
    () => visitors.getVisitorsTableClient(),
    /Missing STORAGE_CONNECTION_STRING/
  );

  // Invalid mode must fail, not select identity or fall back silently.
  process.env.HOPE_TABLE_AUTH_MODE = "invalid";
  process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

  assert.throws(
    () => tables.getFormationEventsTableClient(),
    /Unsupported Table Storage authentication mode/
  );

  console.log("sharedFactoryCallersAuthMode.test.ts passed");
} finally {
  names.forEach((name, index) => {
    const value = previous[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}