import * as assert from "node:assert/strict";
import { createHopeTableClient } from "../../src/shared/storage/createHopeTableClient";

const tableName = "HopeSyntheticTest";
const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";

function rejects(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, pattern);
}

rejects(
  () => createHopeTableClient(tableName, {}),
  /connection string is required/
);

rejects(
  () => createHopeTableClient("", {
    mode: "managed-identity",
    endpoint,
    managedIdentityClientId: clientId
  }),
  /Table name is required/
);

rejects(
  () => createHopeTableClient(tableName, {
    mode: "managed-identity",
    endpoint,
    managedIdentityClientId: ""
  }),
  /client ID is required/
);

rejects(
  () => createHopeTableClient(tableName, {
    mode: "managed-identity",
    endpoint: "http://hopeteststorage01.table.core.windows.net",
    managedIdentityClientId: clientId
  }),
  /HTTPS table endpoint/
);

rejects(
  () => createHopeTableClient(tableName, {
    mode: "managed-identity",
    endpoint: "https://untrusted.example.com",
    managedIdentityClientId: clientId
  }),
  /HTTPS table endpoint/
);

rejects(
  () => createHopeTableClient(tableName, {
    mode: "managed-identity",
    endpoint,
    managedIdentityClientId: clientId,
    connectionString: "UseDevelopmentStorage=true"
  }),
  /must not receive a storage connection string/
);

const legacy = createHopeTableClient(tableName, {
  connectionString: "UseDevelopmentStorage=true"
});

assert.equal(legacy.tableName, tableName);

const identityClient = createHopeTableClient(tableName, {
  mode: "managed-identity",
  endpoint,
  managedIdentityClientId: clientId
});

assert.equal(identityClient.tableName, tableName);
assert.equal(identityClient.url, endpoint);

console.log("createHopeTableClient.test.ts passed");