import * as assert from "node:assert/strict";
import { getTableClient } from "../../src/functions/_shared/tableClient";

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

try {
  for (const name of names) delete process.env[name];

  // Existing connection-string mode remains the default.
  process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

  const legacy = getTableClient("HopeSyntheticTest");
  assert.equal(legacy.tableName, "HopeSyntheticTest");

  // Managed identity must not use the inherited legacy connection string.
  process.env.HOPE_TABLE_AUTH_MODE = "managed-identity";

  assert.throws(
    () => getTableClient("HopeSyntheticTest"),
    /HTTPS table endpoint/
  );

  process.env.HOPE_TABLE_ENDPOINT = endpoint;

  assert.throws(
    () => getTableClient("HopeSyntheticTest"),
    /client ID is required/
  );

  process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = clientId;

  const identity = getTableClient("HopeSyntheticTest");

  assert.equal(identity.tableName, "HopeSyntheticTest");
  assert.equal(identity.url, endpoint);

  // Malformed mode must not fall back to legacy storage.
  process.env.HOPE_TABLE_AUTH_MODE = "unexpected";

  assert.throws(
    () => getTableClient("HopeSyntheticTest"),
    /Unsupported Table Storage authentication mode/
  );

  console.log("functionsTableClientAuthMode.test.ts passed");
} finally {
  names.forEach((name, index) => {
    const value = previous[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}