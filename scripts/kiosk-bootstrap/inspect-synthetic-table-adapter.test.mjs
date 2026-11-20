import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
require("ts-node/register");
const { appendKioskIntakeSubmissionV1 } = require(
  "../../src/repositories/kioskIntakeSubmissionsRepositoryV1.ts"
);
const { matchesSyntheticIntakeRow } = require(
  "../../src/services/visitors/syntheticIntakeInspectionValidation.ts"
);
const source = readFileSync("src/repositories/inspectSyntheticKioskIntake.ts", "utf8");
const factorySource = readFileSync("src/shared/storage/createHopeTableClient.ts", "utf8");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const config = {
  mode: "managed-identity",
  endpoint: "https://sthopekiad20261122.table.core.windows.net",
  managedIdentityClientId: "11111111-2222-4333-8444-555555555555"
};
const payload = {
  name: "Synthetic Kiosk Cleanup Test", email: "kiosk-cleanup@example.invalid",
  phone: "", visitType: "first", interests: ["prayer"], invitedBy: "",
  contactConsent: false
};

function load(text, dependencies) {
  const compiled = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, AbortSignal,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`UNEXPECTED_IMPORT:${name}`);
    }
  });
  return module.exports;
}

function loadAdapter(createClient, exposePrivate = false) {
  return load(source + (exposePrivate
    ? "\nexport { createIsolatedClient, inspectExactRecord };\n" : ""), {
    "../shared/storage/createHopeTableClient": { createHopeTableClient: createClient },
    "../services/visitors/syntheticIntakeInspectionValidation": { matchesSyntheticIntakeRow }
  });
}

async function syntheticRow() {
  let row;
  await appendKioskIntakeSubmissionV1(payload, id, {
    enabled: true,
    now: () => "2026-11-22T15:00:00.000Z",
    table: {
      async createEntity(value) { row = structuredClone(value); },
      async getEntity() { throw new Error("UNEXPECTED_READ"); }
    }
  });
  return { ...row, etag: 'W/"synthetic"' };
}

test("live entry point always denies without constructing or calling a client", async () => {
  let calls = 0;
  const adapter = loadAdapter(() => { calls++; throw new Error("UNEXPECTED_CLIENT"); });
  assert.deepEqual(Object.keys(adapter), ["inspectSyntheticKioskIntake"]);
  const attempts = [
    [],
    [{ enabled: true, authorized: true, uuidEvidence: "claimed", config, id }],
    [{ verified: true, durable: true, execute: true }, () => { calls++; }]
  ];
  for (const args of attempts) {
    const response = await adapter.inspectSyntheticKioskIntake(...args);
    assert.equal(response.status, "AUTHORIZATION_UNAVAILABLE");
    assert.deepEqual(Object.keys(response), ["status"]);
  }
  assert.equal(calls, 0);
});

test("private constructor pins endpoint, user-assigned identity and zero storage retries", () => {
  let calls = 0;
  const adapter = loadAdapter((table, settings, options) => {
    calls++;
    assert.equal(table, "KioskIntakeSubmissions");
    assert.equal(settings.mode, "managed-identity");
    assert.equal(settings.endpoint, config.endpoint);
    assert.equal(settings.managedIdentityClientId, config.managedIdentityClientId);
    assert.deepEqual(Object.keys(settings).sort(), ["endpoint", "managedIdentityClientId", "mode"]);
    assert.equal(options.retryOptions.maxRetries, 0);
    assert.equal(options.redirectOptions.maxRetries, 0);
    return {};
  }, true);
  for (const bad of [
    { ...config, mode: "connection-string" },
    { ...config, endpoint: "https://other.table.core.windows.net" },
    { ...config, endpoint: `${config.endpoint}/` },
    { ...config, managedIdentityClientId: "" },
    { ...config, managedIdentityClientId: "bad" },
    { ...config, connectionString: "synthetic" },
    { ...config, managedIdentityClientId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }
  ]) {
    assert.equal(adapter.createIsolatedClient(bad), null);
  }
  assert.equal(calls, 0);
  assert.ok(adapter.createIsolatedClient(config));
  assert.equal(calls, 1);
});

test("shared factory passes options only to a managed identity TableClient", () => {
  let constructed;
  class Credential {
    constructor(clientId) { this.clientId = clientId; }
  }
  class TableClient {
    constructor(endpoint, table, credential, options) {
      constructed = { endpoint, table, credential, options };
    }
    static fromConnectionString() { throw new Error("UNEXPECTED_SHARED_KEY"); }
  }
  const factory = load(factorySource, {
    "@azure/data-tables": { TableClient, TableServiceClient: class {} },
    "@azure/identity": { ManagedIdentityCredential: Credential }
  });
  const options = { retryOptions: { maxRetries: 0 }, redirectOptions: { maxRetries: 0 } };
  factory.createHopeTableClient("KioskIntakeSubmissions", config, options);
  assert.equal(constructed.endpoint, config.endpoint);
  assert.equal(constructed.table, "KioskIntakeSubmissions");
  assert.equal(constructed.credential.clientId, config.managedIdentityClientId);
  assert.equal(constructed.options, options);
});

test("Azure SDK sends no retry or redirect through an in-memory HTTP transport", async () => {
  let requests = 0;
  let status = 503;
  const { createHttpHeaders } = require("@azure/core-rest-pipeline");
  class Credential {
    async getToken() {
      return { token: "synthetic-token", expiresOnTimestamp: Date.now() + 60000 };
    }
  }
  const factory = load(factorySource, {
    "@azure/data-tables": require("@azure/data-tables"),
    "@azure/identity": { ManagedIdentityCredential: Credential }
  });
  const httpClient = {
    async sendRequest(request) {
      requests++;
      return {
        request, status,
        headers: createHttpHeaders({ location: "https://other.example.test/" }),
        bodyAsText: ""
      };
    }
  };
  const adapter = loadAdapter((table, settings, options) =>
    factory.createHopeTableClient(table, settings, { ...options, httpClient }), true);
  assert.equal((await adapter.inspectExactRecord(config, id)).status, "READ_FAILED");
  assert.equal(requests, 1);
  status = 302;
  assert.equal((await adapter.inspectExactRecord(config, id)).status, "READ_FAILED");
  assert.equal(requests, 2);
});

test("private mocked read checks one exact row and rejects changed records", async () => {
  let row = await syntheticRow();
  let reads = 0;
  const adapter = loadAdapter(() => ({
    async getEntity(partition, rowKey, options) {
      reads++;
      assert.equal(partition, "friends-family-2026-11-22");
      assert.equal(rowKey, id);
      assert.ok(options.abortSignal);
      return row;
    }
  }), true);
  assert.equal((await adapter.inspectExactRecord(config, id)).status, "MATCHED");
  const original = row;
  for (const change of [
    { name: "other" }, { payloadHash: "0".repeat(64) }, { phone: "1" },
    { interestsJson: "[]" }, { source: "other" }, { reviewStatus: "importing" },
    { reviewStatus: "imported" }, { claimId: "claim" }, { extra: true },
    { etag: "*" }, { etag: "" }, { partitionKey: "wrong" }, { rowKey: "wrong" }
  ]) {
    row = { ...original, ...change };
    assert.equal((await adapter.inspectExactRecord(config, id)).status, "ROW_REJECTED");
  }
  row = Object.create(original);
  assert.equal((await adapter.inspectExactRecord(config, id)).status, "ROW_REJECTED");
  assert.equal(reads, 15);
  assert.equal((await adapter.inspectExactRecord(config, "invalid")).status, "INVALID_TARGET");
  assert.equal(reads, 15);
});

test("private mocked read classifies storage errors without retrying or disclosing data", async () => {
  for (const [error, status] of [
    [{ statusCode: 404 }, "NOT_FOUND"],
    [{ statusCode: 401 }, "ACCESS_DENIED"],
    [{ statusCode: 403 }, "ACCESS_DENIED"],
    [{ statusCode: 408 }, "TIMEOUT"],
    [{ statusCode: 504 }, "TIMEOUT"],
    [{ name: "AbortError" }, "TIMEOUT"],
    [{ name: "TimeoutError" }, "TIMEOUT"],
    [{ code: "ETIMEDOUT" }, "TIMEOUT"],
    [{ statusCode: 500, message: "private" }, "READ_FAILED"]
  ]) {
    let reads = 0;
    const adapter = loadAdapter(() => ({
      async getEntity() { reads++; throw error; }
    }), true);
    const response = await adapter.inspectExactRecord(config, id);
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(response), ["status"]);
    assert.equal(reads, 1);
  }
  const adapter = loadAdapter(() => { throw new Error("private"); }, true);
  assert.equal((await adapter.inspectExactRecord(config, id)).status, "CLIENT_UNAVAILABLE");
  assert.equal((await adapter.inspectExactRecord({ ...config, endpoint: "wrong" }, id)).status,
    "INVALID_CONFIGURATION");
});
