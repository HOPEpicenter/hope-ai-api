import * as assert from "node:assert/strict";
import { makeTableClient } from "../../src/shared/storage/makeTableClient";

const settings = [
  "HOPE_TABLE_AUTH_MODE",
  "HOPE_TABLE_ENDPOINT",
  "HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID"
] as const;

const original = settings.map((name) => process.env[name]);

const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";
const tableName = "HopeSyntheticTest";

try {
  for (const name of settings) delete process.env[name];

  // Legacy behavior must remain the default.
  const legacy = makeTableClient(
    "UseDevelopmentStorage=true",
    tableName
  );
  assert.equal(legacy.tableName, tableName);

  process.env.HOPE_TABLE_AUTH_MODE = "invalid";
  assert.throws(
    () => makeTableClient("UseDevelopmentStorage=true", tableName),
    /Unsupported Table Storage authentication mode/
  );

  process.env.HOPE_TABLE_AUTH_MODE = "managed-identity";

  // No automatic fallback to connection-string storage.
  assert.throws(
    () => makeTableClient("UseDevelopmentStorage=true", tableName),
    /must not receive a storage connection string/
  );

  assert.throws(
    () => makeTableClient("", tableName),
    /HTTPS table endpoint/
  );

  process.env.HOPE_TABLE_ENDPOINT = endpoint;

  assert.throws(
    () => makeTableClient("", tableName),
    /client ID is required/
  );

  process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = clientId;

  // Client construction alone must not contact Azure.
  const identityClient = makeTableClient("", tableName);

  assert.equal(identityClient.tableName, tableName);
  assert.equal(identityClient.url, endpoint);

  process.env.HOPE_TABLE_AUTH_MODE = "connection-string";

  const explicitLegacy = makeTableClient(
    "UseDevelopmentStorage=true",
    tableName
  );

  assert.equal(explicitLegacy.tableName, tableName);

  console.log("makeTableClientAuthMode.test.ts passed");
} finally {
  settings.forEach((name, index) => {
    const value = original[index];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}