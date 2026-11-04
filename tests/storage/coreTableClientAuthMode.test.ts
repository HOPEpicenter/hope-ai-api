import * as assert from "node:assert/strict";
import { TableServiceClient } from "@azure/data-tables";

const keys = [
  "HOPE_TABLE_AUTH_MODE",
  "HOPE_TABLE_ENDPOINT",
  "HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID",
  "STORAGE_CONNECTION_STRING"
] as const;

const saved = keys.map((key) => process.env[key]);
const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";
const target = "../../src/storage/tableClient";

const prototype = TableServiceClient.prototype as any;
const originalCreateTable = prototype.createTable;
let createCalls = 0;

function loadFresh(): typeof import("../../src/storage/tableClient") {
  const resolved = require.resolve(target);
  delete require.cache[resolved];
  return require(target);
}

async function main(): Promise<void> {
  try {
    prototype.createTable = async (name: string) => {
      assert.equal(name, "HopeSyntheticTest");
      createCalls += 1;
    };

    for (const key of keys) delete process.env[key];

    // Preserve the original fail-closed behavior in legacy mode.
    assert.throws(
      () => loadFresh(),
      /STORAGE_CONNECTION_STRING is not set/
    );

    process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

    const legacy = loadFresh();
    const localClient = await legacy.getTableClient("HopeSyntheticTest");

    assert.equal(localClient.tableName, "HopeSyntheticTest");
    assert.equal(createCalls, 1);

    // Managed identity must not require or consume the legacy string.
    delete process.env.STORAGE_CONNECTION_STRING;
    process.env.HOPE_TABLE_AUTH_MODE = "managed-identity";

    assert.throws(() => loadFresh(), /HTTPS table endpoint/);

    process.env.HOPE_TABLE_ENDPOINT = endpoint;

    assert.throws(() => loadFresh(), /client ID is required/);

    process.env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID = clientId;

    const identityModule = loadFresh();
    const identityClient = await identityModule.getTableClient(
      "HopeSyntheticTest"
    );

    assert.equal(identityClient.tableName, "HopeSyntheticTest");
    assert.equal(identityClient.url, endpoint);
    assert.equal(createCalls, 2);

    // Even with a legacy string present, explicit identity mode wins.
    process.env.STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";

    const identityWithLegacyPresent = loadFresh();
    const secondIdentityClient = await identityWithLegacyPresent.getTableClient(
      "HopeSyntheticTest"
    );

    assert.equal(secondIdentityClient.url, endpoint);
    assert.equal(createCalls, 3);

    process.env.HOPE_TABLE_AUTH_MODE = "invalid";

    assert.throws(
      () => loadFresh(),
      /Unsupported Table Storage authentication mode/
    );

    console.log("coreTableClientAuthMode.test.ts passed");
  } finally {
    prototype.createTable = originalCreateTable;

    keys.forEach((key, index) => {
      const value = saved[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
