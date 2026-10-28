import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import {
  getFormationEventInspectionAuthorizationConfiguration,
  type FormationEventInspectionAuthorizationConfiguration
} from "../../src/config/formationEventInspectionAuthorization";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { inspectFormationEventWithAuthenticatedAdmin } from "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin";
import {
  createSyntheticTrustedFormationEventInspectionInvocation,
  inspectFormationEventWithTrustedInvocation
} from "../../src/services/formation/inspectFormationEventWithTrustedInvocation";
import type { FormationEventEvidenceReadPort } from "../../src/services/formation/readFormationEventAcquisition";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DASHBOARD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OBJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUDIENCE = "api://hope-backend-synthetic";
const STAFF_ID = "synthetic-admin-1";
const VISITOR = "synthetic-visitor-001";
const EVENT = "synthetic-event-001";
const AT = "2030-01-01T00:00:00.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(AT, EVENT);
const FLAG = "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [FLAG]: "true",
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
    HOPE_ENTRA_TENANT_ID: TENANT,
    HOPE_ENTRA_API_AUDIENCE: AUDIENCE,
    AUTH_MICROSOFT_ENTRA_ID_ID: DASHBOARD,
    HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
    HOPE_ENTRA_REQUIRED_ROLES: "",
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: CLIENT,
    HOPE_ADMIN_STAFF_IDS: STAFF_ID,
    ...overrides
  };
}

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return { visitorId: VISITOR, eventId: EVENT, occurredAt: AT, ...overrides } as FormationEventEvidenceAcquisitionIdentityV1;
}

function record(): Record<string, unknown> {
  return { partitionKey: VISITOR, rowKey: ROW_KEY, visitorId: VISITOR, id: EVENT, occurredAt: AT };
}

function assertSafety(result: FormationEventEvidenceAcquisitionResultV1): void {
  assert.equal(result.contractVersion, "formation_event_evidence_acquisition.v1");
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.historicalAbsenceEstablished, false);
  assert.equal(result.transactionallyComplete, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.repairAuthorized, false);
  assert.equal(result.replayAuthorized, false);
  assert.equal(result.reconciliationAuthorized, false);
}

function countingPort(): { port: FormationEventEvidenceReadPort; calls: () => number } {
  let calls = 0;
  return { port: { getEntity: async () => { calls++; return record(); } }, calls: () => calls };
}

function countingExecutor(): {
  execute: typeof inspectFormationEventWithAuthenticatedAdmin;
  calls: () => number;
  args: () => unknown[][];
} {
  const seen: unknown[][] = [];
  const execute = (async (...args: unknown[]) => {
    seen.push(args);
    return inspectFormationEventWithAuthenticatedAdmin(
      identity(), "x", undefined as never, false, undefined as never
    );
  }) as unknown as typeof inspectFormationEventWithAuthenticatedAdmin;
  return { execute, calls: () => seen.length, args: () => seen };
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "synthetic-invocation-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const localSet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey = (header, token) => localSet(header, token);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ ver: "2.0", tid: TENANT, oid: OBJECT_ID, scp: "staff.access", azp: CLIENT })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-invocation-key" })
    .setIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const staff = (overrides: Partial<CanonicalStaffIdentity> = {}): CanonicalStaffIdentity => ({
    staffId: STAFF_ID,
    displayName: "Synthetic Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: AT,
    updatedAt: AT,
    lastEventId: EVENT,
    entraTenantId: TENANT,
    entraObjectId: OBJECT_ID,
    email: "synthetic@example.invalid",
    phone: null,
    ministryAreaId: "synthetic-area",
    ...overrides
  });

  // Trusted-test closure: real config reader and real authenticated service, with synthetic key/directory fakes.
  function realWith(environment: Record<string, string | undefined>, directory: CanonicalStaffIdentity[] = [staff()]) {
    let authenticatedCalls = 0;
    const invoke = createSyntheticTrustedFormationEventInspectionInvocation(
      () => getFormationEventInspectionAuthorizationConfiguration(environment),
      ((id, accessToken, config, enabled, port) => {
        authenticatedCalls++;
        return inspectFormationEventWithAuthenticatedAdmin(id, accessToken, config, enabled, port, {
          authorizationDependencies: {
            resolveSigningKey,
            readStaffDirectory: async () => directory,
            readCanonicalStaffIdentity: async () => directory[0] ?? null
          }
        });
      }) as typeof inspectFormationEventWithAuthenticatedAdmin
    );
    return { invoke, authenticatedCalls: () => authenticatedCalls };
  }

  async function expectUnavailable(
    environment: Record<string, string | undefined>,
    label: string
  ): Promise<void> {
    const harness = realWith(environment);
    const reader = countingPort();
    const result = await harness.invoke(identity(), token, reader.port);
    assert.equal(result.status, "unavailable", label);
    assert.equal(result.reasonCode, "observation_unavailable", label);
    assert.equal(harness.authenticatedCalls(), 0, label);
    assert.equal(reader.calls(), 0, label);
    assertSafety(result);
  }

  await test("inspection is disabled by default and explicit false", async () => {
    for (const value of [undefined, "", "false", "FALSE"]) {
      await expectUnavailable({ [FLAG]: value }, String(value));
    }
  });

  await test("invalid inspection feature settings fail closed without calls", async () => {
    for (const value of ["yes", "1", "enabled", "truee"]) {
      await expectUnavailable(env({ [FLAG]: value }), value);
    }
  });

  await test("enabled inspection with absent, disabled, or malformed Entra enforcement fails closed", async () => {
    for (const value of [undefined, "", "false", "yes", "1"]) {
      await expectUnavailable(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: value }), String(value));
    }
  });

  await test("malformed Entra administrator configuration fails closed", async () => {
    const cases: Record<string, string | undefined>[] = [
      { HOPE_ADMIN_STAFF_IDS: undefined },
      { HOPE_ADMIN_STAFF_IDS: "a,,b" },
      { HOPE_ENTRA_TENANT_ID: "bad" },
      { HOPE_ENTRA_API_AUDIENCE: undefined },
      { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "bad" },
      { HOPE_ENTRA_REQUIRED_SCOPES: "", HOPE_ENTRA_REQUIRED_ROLES: "" }
    ];
    for (const overrides of cases) await expectUnavailable(env(overrides), JSON.stringify(overrides));
  });

  await test("throwing or malformed configuration readers cause zero dependency calls", async () => {
    const readers: Array<() => unknown> = [
      () => { throw new Error("synthetic-config-secret"); },
      () => undefined,
      () => null,
      () => ({}),
      () => ({ evidenceInspectionEnabled: "true", authorizationConfiguration: {} }),
      () => ({ evidenceInspectionEnabled: true }),
      () => ({ evidenceInspectionEnabled: true, authorizationConfiguration: null }),
      () => ({ evidenceInspectionEnabled: false, authorizationConfiguration: {} }),
      () => Object.defineProperty({}, "evidenceInspectionEnabled", { get() { return true; } }),
      () => new Proxy(
        { evidenceInspectionEnabled: true, authorizationConfiguration: {} },
        { getOwnPropertyDescriptor() { throw new Error("synthetic-config-secret"); } }
      ),
      () => {
        const revocable = Proxy.revocable({ evidenceInspectionEnabled: true, authorizationConfiguration: {} }, {});
        revocable.revoke();
        return revocable.proxy;
      },
      () => Object.defineProperties({}, {
        evidenceInspectionEnabled: { value: true, enumerable: true },
        authorizationConfiguration: { get() { throw new Error("synthetic-config-secret"); } }
      }),
      () => new Proxy(
        { evidenceInspectionEnabled: true },
        {
          getOwnPropertyDescriptor(target, key) {
            if (key === "authorizationConfiguration") throw new Error("synthetic-config-secret");
            return Reflect.getOwnPropertyDescriptor(target, key);
          }
        }
      )
    ];
    for (const reader of readers) {
      const executor = countingExecutor();
      const reads = countingPort();
      const invoke = createSyntheticTrustedFormationEventInspectionInvocation(
        reader as () => FormationEventInspectionAuthorizationConfiguration,
        executor.execute
      );
      const result = await invoke(identity(), token, reads.port);
      assert.equal(result.status, "unavailable");
      assert.equal(executor.calls(), 0);
      assert.equal(reads.calls(), 0);
      assert.equal(JSON.stringify(result).includes("synthetic-config-secret"), false);
      assertSafety(result);
    }
  });

  await test("enabled server configuration is passed to authenticated execution and reads once", async () => {
    const harness = realWith(env());
    const reader = countingPort();
    const result = await harness.invoke(identity(), token, reader.port);
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.candidateRowKey, ROW_KEY);
    assert.equal(harness.authenticatedCalls(), 1);
    assert.equal(reader.calls(), 1);
    assertSafety(result);

    const executor = countingExecutor();
    const expected = getFormationEventInspectionAuthorizationConfiguration(env());
    const invoke = createSyntheticTrustedFormationEventInspectionInvocation(() => expected, executor.execute);
    const port = countingPort().port;
    await invoke(identity(), token, port);
    const [id, accessToken, config, enabled, readPort, extra] = executor.args()[0];
    assert.equal(accessToken, token);
    assert.equal(enabled, true);
    assert.equal(readPort, port);
    assert.equal(extra, undefined);
    assert.equal(expected.evidenceInspectionEnabled && config === expected.authorizationConfiguration, true);
    assert.deepEqual(id, identity());
  });

  await test("rejected authenticated administrator decisions cause no evidence read", async () => {
    const cases: Array<[string, CanonicalStaffIdentity[], Record<string, string | undefined>]> = [
      ["not administrator", [staff()], env({ HOPE_ADMIN_STAFF_IDS: "someone-else" })],
      ["inactive staff", [staff({ status: "inactive" })], env()],
      ["no directory match", [], env()],
      ["binding mismatch", [staff({ entraObjectId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" })], env()]
    ];
    for (const [label, directory, environment] of cases) {
      const harness = realWith(environment, directory);
      const reader = countingPort();
      const result = await harness.invoke(identity(), token, reader.port);
      assert.equal(result.status, "unavailable", label);
      assert.equal(reader.calls(), 0, label);
      assertSafety(result);
    }
  });

  await test("invalid or malformed tokens never reach evidence reads", async () => {
    for (const bad of [undefined, null, "", "   ", "not-a-jwt", `${token}x`, ` ${token}`, 5, {}]) {
      const harness = realWith(env());
      const reader = countingPort();
      const result = await harness.invoke(identity(), bad as string, reader.port);
      assert.equal(result.status, "unavailable");
      assert.equal(reader.calls(), 0);
      assertSafety(result);
    }
  });

  await test("invalid and hostile identities cause no authenticated execution or reads", async () => {
    const hostile = Object.defineProperty({ eventId: EVENT, occurredAt: AT }, "visitorId", {
      get() { throw new Error("identity getter"); }
    });
    const proxy = new Proxy(identity(), { ownKeys() { throw new Error("proxy"); } });
    const identities: unknown[] = [
      undefined, null, {}, [], "x", identity({ visitorId: " " }), identity({ eventId: "" }),
      identity({ occurredAt: "nope" }), hostile, proxy
    ];
    for (const value of identities) {
      const executor = countingExecutor();
      const reads = countingPort();
      const invoke = createSyntheticTrustedFormationEventInspectionInvocation(
        () => getFormationEventInspectionAuthorizationConfiguration(env()),
        executor.execute
      );
      const result = await invoke(value as FormationEventEvidenceAcquisitionIdentityV1, token, reads.port);
      assert.notEqual(result.status, "matching_evidence");
      assert.equal(executor.calls(), 0);
      assert.equal(reads.calls(), 0);
      assertSafety(result);
    }
    // Hostile identity is also fail-closed when gated off.
    const disabled = createSyntheticTrustedFormationEventInspectionInvocation(
      () => ({ evidenceInspectionEnabled: false }),
      countingExecutor().execute
    );
    assertSafety(await disabled(hostile as never, token, countingPort().port));
  });

  await test("thrown authenticated-execution dependencies fail closed in the service and propagate defects", async () => {
    const invoke = createSyntheticTrustedFormationEventInspectionInvocation(
      () => getFormationEventInspectionAuthorizationConfiguration(env()),
      ((id, accessToken, config, enabled, port) =>
        inspectFormationEventWithAuthenticatedAdmin(id, accessToken, config, enabled, port, {
          authorize: async () => { throw new Error("synthetic authorization failure"); }
        })) as typeof inspectFormationEventWithAuthenticatedAdmin
    );
    const reader = countingPort();
    const result = await invoke(identity(), token, reader.port);
    assert.equal(result.status, "unavailable");
    assert.equal(reader.calls(), 0);
    assertSafety(result);

    const defective = createSyntheticTrustedFormationEventInspectionInvocation(
      () => getFormationEventInspectionAuthorizationConfiguration(env()),
      (async () => { throw new Error("synthetic programming defect"); }) as typeof inspectFormationEventWithAuthenticatedAdmin
    );
    await assert.rejects(defective(identity(), token, reader.port), /synthetic programming defect/);
    assert.equal(reader.calls(), 0);
  });

  await test("evidence reader failure preserves unavailable and non-historical absence semantics", async () => {
    const harness = realWith(env());
    const failing = await harness.invoke(identity(), token, {
      getEntity: async () => { throw new Error("synthetic storage failure"); }
    });
    assert.equal(failing.status, "unavailable");
    assertSafety(failing);

    const absent = await realWith(env()).invoke(identity(), token, {
      getEntity: async () => { throw Object.assign(new Error("synthetic"), { status: 404, code: "EntityNotFound" }); }
    });
    assert.equal(absent.status, "observed_absence");
    assert.equal(absent.historicalAbsenceEstablished, false);

    const invalidPort = await realWith(env()).invoke(identity(), token, null as never);
    assert.equal(invalidPort.status, "unavailable");
    assertSafety(invalidPort);
  });

  await test("results never leak tokens, administrator IDs, or Entra configuration", async () => {
    const outcomes = [
      await realWith(env()).invoke(identity(), token, countingPort().port),
      await realWith(env({ [FLAG]: "yes" })).invoke(identity(), token, countingPort().port),
      await realWith(env({ HOPE_ADMIN_STAFF_IDS: "other-admin" })).invoke(identity(), token, countingPort().port)
    ];
    for (const result of outcomes) {
      const serialized = JSON.stringify(result);
      for (const secret of [token, STAFF_ID, TENANT, AUDIENCE, DASHBOARD, CLIENT, "other-admin"]) {
        assert.equal(serialized.includes(secret), false, secret);
      }
    }
  });

  await test("production-shaped interface accepts only identity, token, and read port", async () => {
    assert.equal(inspectFormationEventWithTrustedInvocation.length, 3);
    // Extra arguments (decision, flags, config, overrides) are structurally ignored and cannot alter the gate.
    const original = process.env[FLAG];
    delete process.env[FLAG];
    try {
      const reader = countingPort();
      let forgedAuthorizeCalls = 0;
      const forged = {
        authorize: async () => { forgedAuthorizeCalls++; return { allowed: true }; },
        authorizationDependencies: {},
        evidenceInspectionEnabled: true
      };
      const call = inspectFormationEventWithTrustedInvocation as unknown as (...args: unknown[]) => Promise<FormationEventEvidenceAcquisitionResultV1>;
      const result = await call(identity(), token, reader.port, forged, true, env(), { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" });
      assert.equal(result.status, "unavailable");
      assert.equal(reader.calls(), 0);
      assert.equal(forgedAuthorizeCalls, 0);
      assertSafety(result);
    } finally {
      if (original === undefined) delete process.env[FLAG]; else process.env[FLAG] = original;
    }
  });

  await test("production-shaped path reads server environment and never reaches reads with an unverifiable token", async () => {
    const saved: Record<string, string | undefined> = {};
    const snapshot = env();
    for (const key of Object.keys(snapshot)) saved[key] = process.env[key];
    try {
      for (const [key, value] of Object.entries(snapshot)) process.env[key] = value;
      const reader = countingPort();
      const result = await inspectFormationEventWithTrustedInvocation(identity(), "not-a-jwt", reader.port);
      assert.equal(result.status, "unavailable");
      assert.equal(reader.calls(), 0);
      assertSafety(result);

      process.env[FLAG] = "maybe";
      const invalid = await inspectFormationEventWithTrustedInvocation(identity(), token, reader.port);
      assert.equal(invalid.status, "unavailable");
      assert.equal(reader.calls(), 0);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  await test("source has no route, storage, network, scheduler, legacy, or visitor-contact dependency", () => {
    const source = fs.readFileSync("src/services/formation/inspectFormationEventWithTrustedInvocation.ts", "utf8");
    for (const forbidden of [
      "fetch(", "app.http", "@azure/", "tableClient", "setInterval", "setTimeout", "node-cron",
      "adminStaffActor", "authenticatedAdminStaffActor", "adminApiKey", "ADMIN_API_KEY",
      "authorizeAuthenticatedStaffAction", "jwtVerify", "authorizationDependencies",
      "sendEmail", "twilio", "mailto", "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION"
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.equal(source.includes("process.env"), false);
  });

  console.log(`Passed ${passed} synthetic trusted-invocation tests.`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
