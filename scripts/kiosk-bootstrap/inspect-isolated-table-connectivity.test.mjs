import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { Worker } from "node:worker_threads";
import ts from "typescript";

const require = createRequire(import.meta.url);
const sourcePath = "src/shared/storage/inspectIsolatedTableConnectivity.ts";
const source = readFileSync(sourcePath, "utf8");
const host = "sthopekiad20261122.table.core.windows.net";
const clientId = "11111111-2222-4333-8444-555555555555";
const syntheticToken = "synthetic-token";

async function withinDeadline(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("diagnostic failed to return within 500ms")), 500);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function harness(overrides = {}, exposePrivate = true) {
  const calls = { dns: [], tls: [], http: [], workers: [], errors: [] };
  class Resolver {
    constructor(options) { calls.resolverOptions = options; }
    async resolve4(name) {
      calls.dns.push(name);
      if (overrides.dnsError) throw overrides.dnsError;
      if (overrides.dnsPending) return new Promise((_, reject) => { this.reject = reject; });
      return overrides.addresses ?? ["10.40.2.4"];
    }
    cancel() { this.reject?.(new Error("cancelled")); }
  }
  function connect(options) {
    calls.tls.push(options);
    if (overrides.tlsThrows) throw new Error("private");
    const socket = new EventEmitter();
    socket.authorized = overrides.authorized ?? true;
    socket.destroy = () => { socket.destroyed = true; };
    if (!overrides.tlsPending) setImmediate(() => overrides.tlsError
      ? socket.emit("error", overrides.tlsError) : socket.emit("secureConnect"));
    return socket;
  }
  function request(options, callback) {
    calls.http.push(options);
    if (overrides.httpThrows) throw new Error("private");
    const req = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    req.end = () => {
      if (overrides.httpPending) return;
      setImmediate(() => {
        if (overrides.httpError) return req.emit("error", overrides.httpError);
        callback({ statusCode: overrides.httpStatus ?? 200, destroy() {} });
      });
    };
    return req;
  }
  class MockWorker extends EventEmitter {
    constructor(code, options) {
      super();
      calls.workers.push({ code, options, instance: this });
      this.stdout = { resume() { throw new Error("unexpected stdout read"); } };
      this.stderr = { resume() { throw new Error("unexpected stderr read"); } };
      if (!overrides.identityPending) {
        setImmediate(() => overrides.identityError
          ? this.emit("error", new Error("private"))
          : this.emit("message", { token: syntheticToken }));
      }
    }
    terminate() {
      this.terminateCalls = (this.terminateCalls ?? 0) + 1;
      this.terminated = true;
      if (overrides.terminateThrows) throw new Error("private");
      if (overrides.terminateRejects) return Promise.reject(new Error("private"));
      if (overrides.terminatePending) {
        return new Promise((resolve, reject) => {
          this.resolveTermination = resolve;
          this.rejectTermination = reject;
        });
      }
      return Promise.resolve(0);
    }
    unref() { this.unrefCalls = (this.unrefCalls ?? 0) + 1; }
  }
  const dependencies = {
    "node:dns/promises": { Resolver },
    "node:https": { request },
    "node:net": require("node:net"),
    "node:tls": {
      connect,
      checkServerIdentity(name) { calls.checkedHost = name; }
    },
    "node:worker_threads": { Worker: MockWorker },
    ...overrides.dependencies
  };
  const text = source.replace("const TIMEOUT_MS = 10000;", `const TIMEOUT_MS = ${overrides.timeoutMs ?? 20};`) +
    (exposePrivate ? "\nexport { privateRange, resolvePrivateAddress, checkTls, acquireStorageToken, checkService, runPrivateProbe };\n" : "");
  const compiled = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, AbortController, setTimeout, clearTimeout,
    console: { error(message) { calls.errors.push(message); } },
    process: { env: {
      HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID: overrides.clientId ?? clientId,
      IDENTITY_ENDPOINT: "http://127.0.0.1:41234/identity",
      IDENTITY_HEADER: "synthetic-header",
      ...overrides.env
    } },
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`UNEXPECTED_IMPORT:${name}`);
    }
  });
  return { probe: module.exports, calls };
}

test("the sole production export denies every attempt without constructing dependencies", async () => {
  const { probe, calls } = harness({
    env: { ENABLE_PROBE: "true", EXECUTE: "true", APPROVED: "true" }
  }, false);
  assert.deepEqual(Object.keys(probe), ["inspectIsolatedTableConnectivity"]);
  for (const args of [[], [true], [{ execute: true, approved: true, cidr: "10.40.2.0/24" }], [() => true]]) {
    const result = await probe.inspectIsolatedTableConnectivity(...args);
    assert.equal(result.status, "AUTHORIZATION_UNAVAILABLE");
    assert.deepEqual(Object.keys(result), ["status"]);
  }
  assert.equal(calls.dns.length + calls.tls.length + calls.http.length + calls.workers.length, 0);
});

test("no application module imports or starts the disconnected probe", () => {
  function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
    });
  }
  const references = files("src").filter((path) =>
    readFileSync(path, "utf8").includes("inspectIsolatedTableConnectivity"));
  assert.deepEqual(references.map((path) => path.replaceAll("\\", "/")), [sourcePath]);
});

test("DNS requires a canonical RFC1918 subnet and rejects mixed or unexpected answers", async () => {
  for (const cidr of ["", "0.0.0.0/0", "10.40.2.4/24", "10.0.0.0/7", "100.64.0.0/10", "10.40.2.0/33"]) {
    const { probe, calls } = harness();
    assert.equal((await probe.resolvePrivateAddress(cidr)).status, "INVALID_RANGE");
    assert.equal(calls.dns.length, 0);
  }
  for (const addresses of [[], ["10.40.3.4"], ["10.40.2.4", "203.0.113.1"], ["::1"]]) {
    assert.equal((await harness({ addresses }).probe.resolvePrivateAddress("10.40.2.0/24")).status,
      "UNEXPECTED_ADDRESS");
  }
  const { probe, calls } = harness();
  assert.equal((await probe.resolvePrivateAddress("10.40.2.0/24")).status, "OK");
  assert.deepEqual(calls.dns, [host]);
  assert.equal(calls.resolverOptions.tries, 1);
  assert.equal((await harness({ dnsError: new Error("private") }).probe.resolvePrivateAddress("10.40.2.0/24")).status, "DNS_FAILURE");
  assert.equal((await harness({ dnsPending: true }).probe.resolvePrivateAddress("10.40.2.0/24")).status, "DNS_TIMEOUT");
});

test("TLS uses the selected private IP with mandatory certificate and hostname verification", async () => {
  const { probe, calls } = harness();
  assert.equal(await probe.checkTls("10.40.2.4"), "OK");
  const options = calls.tls[0];
  assert.equal(options.host, "10.40.2.4");
  assert.equal(options.port, 443);
  assert.equal(options.servername, host);
  assert.equal(options.rejectUnauthorized, true);
  options.checkServerIdentity("attacker.example", {});
  assert.equal(calls.checkedHost, host);
  assert.equal(await harness({ authorized: false }).probe.checkTls("10.40.2.4"), "TLS_FAILURE");
  assert.equal(await harness({ tlsError: { code: "CERT_HAS_EXPIRED" } }).probe.checkTls("10.40.2.4"), "TLS_FAILURE");
  assert.equal(await harness({ tlsError: { code: "ECONNREFUSED" } }).probe.checkTls("10.40.2.4"), "NETWORK_FAILURE");
  assert.equal(await harness({ tlsThrows: true }).probe.checkTls("10.40.2.4"), "NETWORK_FAILURE");
  assert.equal(await harness({ tlsPending: true }).probe.checkTls("10.40.2.4"), "NETWORK_TIMEOUT");
});

test("identity uses an isolated, bounded worker for the configured user-assigned identity", async () => {
  assert.equal((await harness({ clientId: "bad" }).probe.acquireStorageToken()).status,
    "INVALID_IDENTITY_CONFIGURATION");
  assert.equal((await harness({ env: { IDENTITY_HEADER: "" } }).probe.acquireStorageToken()).status,
    "INVALID_IDENTITY_CONFIGURATION");
  assert.equal((await harness({ identityError: new Error("private") }).probe.acquireStorageToken()).status,
    "IDENTITY_FAILURE");
  const pending = harness({ identityPending: true });
  assert.equal((await pending.probe.acquireStorageToken()).status, "IDENTITY_TIMEOUT");
  assert.equal(pending.calls.workers[0].instance.terminated, true);
  const { probe, calls } = harness();
  assert.equal((await probe.acquireStorageToken()).status, "OK");
  const { code, options, instance } = calls.workers[0];
  assert.equal(options.workerData, clientId);
  assert.equal(options.eval, true);
  assert.equal(options.stdout, true);
  assert.equal(options.stderr, true);
  assert.deepEqual(Object.keys(options.env).sort(), ["IDENTITY_ENDPOINT", "IDENTITY_HEADER"]);
  assert.equal(instance.terminated, true);
  assert.equal(instance.unrefCalls, 1);
  let credentialOptions;
  let tokenScope;
  let message;
  class Credential {
    constructor(id, options) { assert.equal(id, clientId); credentialOptions = options; }
    async getToken(scope) { tokenScope = scope; return { token: syntheticToken }; }
  }
  vm.runInNewContext(code, { require(name) {
    if (name === "node:worker_threads") return { parentPort: { postMessage(value) { message = value; } }, workerData: clientId };
    if (name === "@azure/identity") return { ManagedIdentityCredential: Credential };
    throw new Error("unexpected import");
  } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(credentialOptions.retryOptions.maxRetries, 0);
  assert.equal(credentialOptions.redirectOptions.maxRetries, 0);
  assert.equal(tokenScope, "https://storage.azure.com/.default");
  assert.equal(message.token, syntheticToken);
});

test("timeout returns even if termination never settles and ignores late token messages", async () => {
  const { probe, calls } = harness({ identityPending: true, terminatePending: true });
  const outcome = await withinDeadline(probe.acquireStorageToken());
  const worker = calls.workers[0].instance;
  assert.equal(outcome.status, "IDENTITY_TIMEOUT");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.unrefCalls, 1);
  worker.emit("message", { token: syntheticToken });
  assert.equal(outcome.status, "IDENTITY_TIMEOUT");
  assert.equal(calls.workers.length, 1);
  worker.rejectTermination(new Error("private"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.errors, ["ISOLATED_TABLE_IDENTITY_CLEANUP_FAILED"]);
});

test("slow termination cannot turn a timed-out token into success", async () => {
  const { probe, calls } = harness({ terminatePending: true });
  const outcome = await withinDeadline(probe.acquireStorageToken());
  const worker = calls.workers[0].instance;
  assert.equal(outcome.status, "IDENTITY_TIMEOUT");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.unrefCalls, 1);
  worker.resolveTermination(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(outcome.status, "IDENTITY_TIMEOUT");
  assert.equal(calls.workers.length, 1);
});

test("cleanup errors fail closed without leaking error details or retrying", async () => {
  for (const overrides of [{ terminateRejects: true }, { terminateThrows: true }]) {
    const { probe, calls } = harness(overrides);
    const outcome = await probe.acquireStorageToken();
    const worker = calls.workers[0].instance;
    assert.equal(outcome.status, "IDENTITY_FAILURE");
    assert.deepEqual(Object.keys(outcome), ["status"]);
    assert.equal(worker.terminateCalls, 1);
    assert.equal(worker.unrefCalls, 1);
    assert.equal(calls.workers.length, 1);
  }
});

test("a stuck real worker does not retain a referenced message-port handle", async () => {
  let actualWorker;
  class StuckWorker extends Worker {
    constructor() {
      super("setInterval(() => {}, 1000)", { eval: true, stdout: true, stderr: true });
      actualWorker = this;
    }
    terminate() { return new Promise(() => {}); }
  }
  const countPorts = () => process.getActiveResourcesInfo().filter((type) => type === "MessagePort").length;
  const before = countPorts();
  const { probe } = harness({
    timeoutMs: 50,
    dependencies: { "node:worker_threads": { Worker: StuckWorker } }
  });
  try {
    assert.equal((await withinDeadline(probe.acquireStorageToken())).status, "IDENTITY_TIMEOUT");
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(countPorts() <= before);
  } finally {
    if (actualWorker) await Worker.prototype.terminate.call(actualWorker);
  }
});

test("metadata request is account-level only, pinned to TLS, and never follows redirects", async () => {
  for (const [httpStatus, status] of [[200, "OK"], [401, "HTTP_401"], [403, "HTTP_403"], [302, "HTTP_OTHER"], [503, "HTTP_OTHER"]]) {
    const { probe, calls } = harness({ httpStatus });
    assert.equal(await probe.checkService("10.40.2.4", syntheticToken), status);
    assert.equal(calls.http.length, 1);
    const options = calls.http[0];
    assert.equal(options.host, "10.40.2.4");
    assert.equal(options.port, 443);
    assert.equal(options.servername, host);
    assert.equal(options.headers.host, host);
    assert.equal(options.method, "GET");
    assert.equal(options.path, "/?restype=service&comp=properties");
    assert.equal(options.agent, false);
    assert.equal(options.rejectUnauthorized, true);
    options.checkServerIdentity("attacker.example", {});
    assert.equal(calls.checkedHost, host);
  }
  assert.equal(await harness({ httpPending: true }).probe.checkService("10.40.2.4", syntheticToken), "NETWORK_TIMEOUT");
  assert.equal(await harness({ httpError: { code: "CERT_HAS_EXPIRED" } }).probe.checkService("10.40.2.4", syntheticToken), "TLS_FAILURE");
  assert.equal(await harness({ httpThrows: true }).probe.checkService("10.40.2.4", syntheticToken), "NETWORK_FAILURE");
});

test("private orchestration returns status only and keeps identity independent of DNS", async () => {
  const valid = harness();
  const result = await valid.probe.runPrivateProbe("10.40.2.0/24");
  assert.deepEqual({ ...result }, { dns: "OK", tls: "OK", identity: "OK", service: "OK" });
  assert.equal(JSON.stringify(result).includes(syntheticToken), false);
  const failed = harness({ dnsError: new Error("private") });
  const denied = await failed.probe.runPrivateProbe("10.40.2.0/24");
  assert.deepEqual({ ...denied }, { dns: "DNS_FAILURE", tls: "NOT_CHECKED", identity: "OK", service: "NOT_CHECKED" });
  assert.equal(failed.calls.workers.length, 1);
  assert.equal(failed.calls.http.length, 0);
});

test("real managed identity SDK sends no retries or redirects through a mocked transport", async () => {
  const { probe, calls } = harness();
  await probe.acquireStorageToken();
  const env = { ...process.env, IDENTITY_ENDPOINT: "http://127.0.0.1:41234/identity", IDENTITY_HEADER: "synthetic-header" };
  for (const name of ["MSI_ENDPOINT", "MSI_SECRET", "AZURE_POD_IDENTITY_AUTHORITY_HOST", "AZURE_FEDERATED_TOKEN_FILE"]) delete env[name];
  for (const status of [503, 302]) {
    const code = calls.workers[0].code.replace("retryOptions:", `
      httpClient: { async sendRequest(request) {
        parentPort.postMessage({ observed: true });
        return { request, status: ${status}, headers: require("@azure/core-rest-pipeline").createHttpHeaders({ location: "http://other.invalid" }), bodyAsText: "" };
      } },
      retryOptions:`);
    const worker = new Worker(code, { eval: true, workerData: clientId, env, stdout: true, stderr: true });
    const messages = [];
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("worker timed out")), 5000);
        worker.on("message", (message) => {
          messages.push(message);
          if (message.failed) { clearTimeout(timer); resolve(); }
        });
        worker.once("error", (error) => { clearTimeout(timer); reject(error); });
      });
      assert.equal(messages.filter((message) => message.observed).length, 1);
    } finally {
      await worker.terminate();
    }
  }
});
