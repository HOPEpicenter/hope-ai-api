import * as assert from "node:assert/strict";
import { createHopeTableServiceClient } from "../../src/shared/storage/createHopeTableClient";

const endpoint = "https://hopeteststorage01.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";

assert.throws(
  () => createHopeTableServiceClient({}),
  /connection string is required/
);

assert.throws(
  () => createHopeTableServiceClient({
    mode: "managed-identity",
    endpoint
  }),
  /client ID is required/
);

assert.throws(
  () => createHopeTableServiceClient({
    mode: "managed-identity",
    endpoint: "http://hopeteststorage01.table.core.windows.net",
    managedIdentityClientId: clientId
  }),
  /HTTPS table endpoint/
);

assert.throws(
  () => createHopeTableServiceClient({
    mode: "managed-identity",
    endpoint,
    managedIdentityClientId: clientId,
    connectionString: "UseDevelopmentStorage=true"
  }),
  /must not receive a storage connection string/
);

assert.throws(
  () => createHopeTableServiceClient({
    mode: "unsupported" as any,
    connectionString: "UseDevelopmentStorage=true"
  }),
  /Unsupported Table Storage authentication mode/
);

const local = createHopeTableServiceClient({
  connectionString: "UseDevelopmentStorage=true"
});

assert.ok(local);
assert.equal(typeof local.createTable, "function");

const identity = createHopeTableServiceClient({
  mode: "managed-identity",
  endpoint,
  managedIdentityClientId: clientId
});

assert.equal(identity.url, endpoint);
assert.equal(typeof identity.createTable, "function");

console.log("createHopeTableServiceClient.test.ts passed");
