import assert from "node:assert/strict";
import Module from "node:module";
import { AzureNamedKeyCredential, RestError, TableClient } from "@azure/data-tables";
import { createHttpHeaders } from "@azure/core-rest-pipeline";

const tableClientPath = require.resolve("../../src/functions/_shared/tableClient");
const directoryPath = require.resolve("../../src/services/staff/readCanonicalStaffDirectory");
const handlerPath = require.resolve("../../src/functions/getStaffIdentities/index");
const originalTableClient = require.cache[tableClientPath];
const originalDirectory = require.cache[directoryPath];
const originalHandler = require.cache[handlerPath];
const settings = [
  "HOPE_API_KEY", "WEBSITE_SITE_NAME", "HOPE_TABLE_AUTH_MODE", "HOPE_TABLE_ENDPOINT"
] as const;
const previous = Object.fromEntries(settings.map(name => [name, process.env[name]]));
const mismatch = "AuthorizationPermissionMismatch";
let failure: unknown;
let shouldThrow = false;
let reads = 0;
let directoryReads = 0;
let syntheticClient: TableClient | undefined;

const tableModule = new Module(tableClientPath);
tableModule.filename = tableClientPath;
tableModule.loaded = true;
tableModule.exports = {
  getTableClient: (name: string) => {
    assert.equal(name, "StaffEvents");
    reads++;
    if (syntheticClient) return syntheticClient;
    return {
      listEntities: (options: unknown) => {
        assert.deepEqual(options, {
          queryOptions: {
            filter: "PartitionKey eq '__staff_recovery_probe__'",
            select: ["PartitionKey"]
          }
        });
        return {
          byPage: (page: unknown) => {
            assert.deepEqual(page, { maxPageSize: 1 });
            return {
              next: async () => {
                if (shouldThrow) throw failure;
                return { done: false, value: [{ secret: "synthetic-record" }] };
              }
            };
          }
        };
      }
    };
  }
};
const directoryModule = new Module(directoryPath);
directoryModule.filename = directoryPath;
directoryModule.loaded = true;
directoryModule.exports = {
  readCanonicalStaffDirectory: async () => {
    directoryReads++;
    return [];
  }
};

function response(status: number, code?: string) {
  return {
    status,
    headers: {
      get: (name: string) => {
        assert.equal(name, "x-ms-error-code");
        return code;
      }
    }
  };
}

async function run(): Promise<void> {
  require.cache[tableClientPath] = tableModule;
  require.cache[directoryPath] = directoryModule;
  delete require.cache[handlerPath];
  const { getStaffIdentities } =
    require(handlerPath) as typeof import("../../src/functions/getStaffIdentities/index");

  Object.assign(process.env, {
    HOPE_API_KEY: "synthetic-key",
    WEBSITE_SITE_NAME: "hope-kiosk-acceptance-api",
    HOPE_TABLE_AUTH_MODE: "managed-identity",
    HOPE_TABLE_ENDPOINT: "https://sthopekiad20261122.table.core.windows.net"
  });

  async function invoke(key = "synthetic-key", probe = "true") {
    const logs: string[] = [];
    const context = {
      res: undefined as any,
      log: {
        warn: (message: string) => logs.push(message),
        error: (message: string) => logs.push(message)
      }
    };
    await getStaffIdentities(context, {
      headers: { "x-api-key": key },
      query: { staffStorageProbe: probe }
    });
    return { res: context.res, logs };
  }

  try {
    let result = await invoke("");
    assert.equal(result.res.status, 401);
    assert.equal(reads, 0);
    result = await invoke("wrong-key");
    assert.equal(result.res.status, 401);
    assert.equal(reads, 0);
    delete process.env.HOPE_API_KEY;
    result = await invoke();
    assert.equal(result.res.status, 500);
    assert.equal(reads, 0);
    process.env.HOPE_API_KEY = "synthetic-key";

    for (const [name, invalid] of [
      ["WEBSITE_SITE_NAME", "other-site"],
      ["HOPE_TABLE_AUTH_MODE", "connection-string"],
      ["HOPE_TABLE_ENDPOINT", "https://other.invalid"]
    ] as const) {
      const original = process.env[name];
      process.env[name] = invalid;
      result = await invoke();
      assert.equal(result.res.status, 404);
      assert.deepEqual(result.res.body, { code: "STAFF_STORAGE_PROBE_UNAVAILABLE" });
      assert.equal(reads, 0);
      process.env[name] = original;
    }

    result = await invoke();
    assert.equal(result.res.status, 200);
    assert.deepEqual(result.res.body, { code: "STAFF_STORAGE_READ_ALLOWED" });
    assert.equal(result.res.headers["cache-control"], "no-store");
    assert.deepEqual(result.logs, []);

    result = await invoke("synthetic-key", "false");
    assert.equal(result.res.status, 200);
    assert.equal(result.res.body.count, 0);
    assert.equal(directoryReads, 1);
    assert.equal(reads, 1);

    shouldThrow = true;
    const denied = [
      new RestError("synthetic-secret", { statusCode: 403, code: mismatch }),
      { response: response(403, mismatch) },
      { statusCode: 403, response: response(403, mismatch) },
      { statusCode: 403, code: mismatch, response: response(403, mismatch) }
    ];
    for (const error of denied) {
      failure = error;
      result = await invoke();
      assert.equal(result.res.status, 503);
      assert.deepEqual(result.res.body, { code: "STAFF_STORAGE_PERMISSION_DENIED" });
      assert.equal(result.res.headers["cache-control"], "no-store");
      assert.deepEqual(result.logs, []);
    }

    const inconclusive = [
      { statusCode: 403, code: mismatch, response: response(500, mismatch) },
      { statusCode: 500, response: response(403, mismatch) },
      { statusCode: 403, code: "AuthorizationFailure", response: response(403, mismatch) },
      { statusCode: 403, code: mismatch, response: response(403, "AuthenticationFailed") },
      { statusCode: 403, code: mismatch, response: response(403, "AuthorizationFailure") },
      { statusCode: 403, code: "AuthorizationFailure" },
      { statusCode: 403 },
      { statusCode: 401, code: "AuthenticationFailed" },
      { code: "ETIMEDOUT" },
      { statusCode: 500, code: mismatch },
      { statusCode: 500, response: response(500, mismatch) },
      { statusCode: "synthetic-secret", code: mismatch },
      { statusCode: 418, code: "synthetic-secret" },
      { code: mismatch },
      new Error("synthetic-secret"),
      null
    ];
    for (const error of inconclusive) {
      failure = error;
      result = await invoke();
      assert.equal(result.res.status, 500);
      assert.equal(result.res.body.error.code, "GET_STAFF_IDENTITIES_FAILED");
      assert.equal(result.logs.length, 2);
      const diagnostic = JSON.parse(result.logs[0]);
      assert.deepEqual(Object.keys(diagnostic).sort(),
        ["operation", "responseStatus", "statusCode"]);
      assert.equal(diagnostic.operation, "staffStorageProbe");
      for (const status of [diagnostic.statusCode, diagnostic.responseStatus]) {
        assert.ok([400, 401, 403, 404, 408, 429, 500, 502, 503, 504,
          "unavailable", "other"].includes(status));
      }
      assert.doesNotMatch(JSON.stringify(result.logs), /synthetic-secret|Authorization|Authentication|ETIMEDOUT/);
    }

    syntheticClient = new TableClient(
      "https://synthetic.invalid",
      "StaffEvents",
      new AzureNamedKeyCredential("synthetic", "c3ludGhldGlj"),
      {
        retryOptions: { maxRetries: 0 },
        httpClient: {
          sendRequest: async request => ({
            request,
            status: 403,
            headers: createHttpHeaders({
              "x-ms-error-code": mismatch,
              "content-type": "application/json"
            }),
            bodyAsText: JSON.stringify({ "odata.error": { code: mismatch, message: { value: "synthetic" } } })
          })
        }
      }
    );
    let sdkError: unknown;
    try {
      await syntheticClient.listEntities().byPage({ maxPageSize: 1 }).next();
    } catch (error) {
      sdkError = error;
    }
    assert.ok(sdkError instanceof RestError);
    assert.equal(sdkError.statusCode, 403);
    assert.equal(sdkError.code, undefined);
    assert.equal(sdkError.response?.status, 403);
    assert.equal(sdkError.response?.headers.get("x-ms-error-code"), mismatch);
    assert.equal(Object.prototype.propertyIsEnumerable.call(sdkError, "response"), false);
    result = await invoke();
    assert.equal(result.res.status, 503);
    assert.deepEqual(result.res.body, { code: "STAFF_STORAGE_PERMISSION_DENIED" });
    assert.deepEqual(result.logs, []);
    console.log("Staff storage probe tests passed");
  } finally {
    for (const name of settings) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    if (originalTableClient) require.cache[tableClientPath] = originalTableClient;
    else delete require.cache[tableClientPath];
    if (originalDirectory) require.cache[directoryPath] = originalDirectory;
    else delete require.cache[directoryPath];
    if (originalHandler) require.cache[handlerPath] = originalHandler;
    else delete require.cache[handlerPath];
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
