import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import type {
  AuthorizeAuthenticatedStaffActionDependencies
} from "../../src/services/authorization/authorizeAuthenticatedStaffAction";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1
} from "../../src/services/formation/formationEventProductionReadBoundaryContract";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STAFF_ID = "synthetic-authorized-reader-admin";
const VISITOR_ID = "synthetic-authorized-reader-visitor";
const EVENT_ID = "synthetic-authorized-reader-event";
const OCCURRED_AT = "2030-06-07T08:09:10.000Z";
const AUDIENCE = "api://synthetic-authorized-reader";
const FEATURE_SETTING = "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION";
const AUTHORIZATION_PATH = require.resolve(
  "../../src/services/authorization/authorizeAuthenticatedStaffAction"
);
const READ_ONLY_BOUNDARY_PATH = require.resolve(
  "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary"
);
const STORAGE_CLIENT_PATH = require.resolve("../../src/storage/tableClient");
const AZURE_TABLES_PATH = require.resolve("@azure/data-tables");
const READER_FACTORY_PATH = require.resolve(
  "../../src/services/formation/createFormationEventV1BackendReadPort"
);
const SERVICE_PATH = require.resolve(
  "../../src/services/formation/inspectFormationEventWithAuthorizedBackendReader"
);

type AuthorizationFunction = typeof import("../../src/services/authorization/authorizeAuthenticatedStaffAction")
  .authorizeAuthenticatedStaffAction;
type ServiceModule = typeof import("../../src/services/formation/inspectFormationEventWithAuthorizedBackendReader");
type ReaderFactory = typeof import("../../src/services/formation/createFormationEventV1BackendReadPort")
  .createFormationEventV1BackendReadPort;

const nodeModule = require("module") as typeof import("module");

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return {
    visitorId: VISITOR_ID,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    ...overrides
  } as FormationEventEvidenceAcquisitionIdentityV1;
}

function canonicalStaff(
  overrides: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: STAFF_ID,
    displayName: "Synthetic Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    lastEventId: EVENT_ID,
    entraTenantId: TENANT_ID,
    entraObjectId: OBJECT_ID,
    email: "synthetic@example.invalid",
    phone: null,
    ministryAreaId: "synthetic-area",
    ...overrides
  };
}

function record(): Record<string, unknown> {
  return {
    partitionKey: VISITOR_ID,
    rowKey: `${OCCURRED_AT}__${EVENT_ID}`,
    visitorId: VISITOR_ID,
    idempotencyKey: EVENT_ID,
    occurredAt: OCCURRED_AT
  };
}

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    [FEATURE_SETTING]: "true",
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
    HOPE_ENTRA_TENANT_ID: TENANT_ID,
    HOPE_ENTRA_API_AUDIENCE: AUDIENCE,
    AUTH_MICROSOFT_ENTRA_ID_ID: CLIENT_ID,
    HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
    HOPE_ENTRA_REQUIRED_ROLES: "",
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: CLIENT_ID,
    HOPE_ADMIN_STAFF_IDS: STAFF_ID,
    ...overrides
  };
}

function setEnvironment(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function replaceCachedModule(
  modulePath: string,
  exports: Record<string, unknown>
): () => void {
  const previous = require.cache[modulePath];
  const syntheticModule = new nodeModule.Module(modulePath);
  syntheticModule.filename = modulePath;
  syntheticModule.loaded = true;
  syntheticModule.exports = exports;
  require.cache[modulePath] = syntheticModule;
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

function loadActualAuthorizationWithSyntheticStorage(
  dependencies: AuthorizeAuthenticatedStaffActionDependencies
): {
  readonly restore: () => void;
  readonly reset: () => void;
  readonly calls: () => number;
  readonly events: () => readonly string[];
  readonly markEvent: (event: string) => void;
  readonly outcomes: () => readonly string[];
  readonly observedArguments: () => readonly unknown[][];
  readonly storageCalls: () => number;
} {
  let storageCalls = 0;
  const restoreStorage = replaceCachedModule(STORAGE_CLIENT_PATH, {
    getTableClient: async () => {
      storageCalls++;
      throw new Error("Synthetic guard: authorization attempted real storage access");
    }
  });
  const previousAuthorization = require.cache[AUTHORIZATION_PATH];
  delete require.cache[AUTHORIZATION_PATH];
  const actualAuthorizationModule = require(AUTHORIZATION_PATH) as {
    authorizeAuthenticatedStaffAction: AuthorizationFunction;
  };
  const actualAuthorize = actualAuthorizationModule.authorizeAuthenticatedStaffAction;
  let authorizationCalls = 0;
  const events: string[] = [];
  const outcomes: string[] = [];
  const observedArguments: unknown[][] = [];
  const authorize = (async (...args: Parameters<AuthorizationFunction>) => {
    authorizationCalls++;
    observedArguments.push(args);
    events.push("authorization_started");
    const decision = await actualAuthorize(
      args[0],
      args[1],
      args[2],
      args[3],
      undefined,
      dependencies
    );
    outcomes.push(decision.allowed ? "allowed" : decision.reason);
    events.push("authorization_resolved");
    return decision;
  }) as AuthorizationFunction;
  const syntheticAuthorizationModule = require.cache[AUTHORIZATION_PATH]!;
  syntheticAuthorizationModule.exports = {
    authorizeAuthenticatedStaffAction: authorize
  };

  return {
    restore: () => {
      if (previousAuthorization) require.cache[AUTHORIZATION_PATH] = previousAuthorization;
      else delete require.cache[AUTHORIZATION_PATH];
      restoreStorage();
    },
    reset: () => {
      authorizationCalls = 0;
      events.length = 0;
      outcomes.length = 0;
      observedArguments.length = 0;
    },
    calls: () => authorizationCalls,
    events: () => [...events],
    markEvent: event => events.push(event),
    outcomes: () => [...outcomes],
    observedArguments: () => observedArguments.map(args => [...args]),
    storageCalls: () => storageCalls
  };
}

function installReaderFactory(
  getEntity: (partitionKey: string, rowKey: string) => Promise<unknown>,
  construct: () => void
): {
  readonly restore: () => void;
  readonly reset: () => void;
  readonly constructions: () => number;
} {
  const previousFactory = require.cache[READER_FACTORY_PATH];
  let constructions = 0;
  const factory: ReaderFactory = () => {
    constructions++;
    construct();
    return Object.freeze({ getEntity });
  };
  const syntheticModule = new nodeModule.Module(READER_FACTORY_PATH);
  syntheticModule.filename = READER_FACTORY_PATH;
  syntheticModule.loaded = true;
  syntheticModule.exports = {
    createFormationEventV1BackendReadPort: factory
  };
  require.cache[READER_FACTORY_PATH] = syntheticModule;

  return {
    restore: () => {
      if (previousFactory) require.cache[READER_FACTORY_PATH] = previousFactory;
      else delete require.cache[READER_FACTORY_PATH];
    },
    reset: () => {
      constructions = 0;
    },
    constructions: () => constructions
  };
}

function loadService(): ServiceModule["inspectFormationEventWithAuthorizedBackendReader"] {
  delete require.cache[SERVICE_PATH];
  return (
    require(SERVICE_PATH) as ServiceModule
  ).inspectFormationEventWithAuthorizedBackendReader;
}

function installSyntheticReadiness(ready: boolean): () => void {
  const previous = require.cache[READ_ONLY_BOUNDARY_PATH];
  const syntheticModule = new nodeModule.Module(READ_ONLY_BOUNDARY_PATH);
  syntheticModule.filename = READ_ONLY_BOUNDARY_PATH;
  syntheticModule.loaded = true;
  syntheticModule.exports = {
    FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY: ready
  };
  require.cache[READ_ONLY_BOUNDARY_PATH] = syntheticModule;
  return () => {
    if (previous) require.cache[READ_ONLY_BOUNDARY_PATH] = previous;
    else delete require.cache[READ_ONLY_BOUNDARY_PATH];
  };
}

function assertSafeResult(result: FormationEventEvidenceAcquisitionResultV1): void {
  assert.equal(result.contractVersion, "formation_event_evidence_acquisition.v1");
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.historicalAbsenceEstablished, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.repairAuthorized, false);
  assert.equal(result.replayAuthorized, false);
  assert.equal(result.reconciliationAuthorized, false);
}

function assertNoSensitiveDetails(
  result: FormationEventEvidenceAcquisitionResultV1,
  token: string
): void {
  const serialized = JSON.stringify(result);
  for (const secret of [
    token,
    STAFF_ID,
    TENANT_ID,
    CLIENT_ID,
    AUDIENCE,
    "synthetic-secret-reader-failure",
    "synthetic-secret-read-failure"
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
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
  jwk.kid = "synthetic-authorized-reader-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const localJwkSet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey = (header, token) => localJwkSet(header, token);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    ver: "2.0",
    tid: TENANT_ID,
    oid: OBJECT_ID,
    scp: "staff.access",
    azp: CLIENT_ID
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-authorized-reader-key" })
    .setIssuer(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  let directory = [canonicalStaff()];
  let canonicalIdentity: CanonicalStaffIdentity | null = canonicalStaff();
  const authorizationHarness = loadActualAuthorizationWithSyntheticStorage({
    resolveSigningKey,
    readStaffDirectory: async () => directory,
    readCanonicalStaffIdentity: async staffId =>
      canonicalIdentity?.staffId === staffId ? canonicalIdentity : null
  });
  let readCalls = 0;
  const events = authorizationHarness.events;
  const readerHarness = installReaderFactory(
    async (partitionKey, rowKey) => {
      readCalls++;
      authorizationHarness.markEvent("read_started");
      assert.equal(partitionKey, VISITOR_ID);
      assert.equal(rowKey, `${OCCURRED_AT}__${EVENT_ID}`);
      return record();
    },
    () => {
      authorizationHarness.markEvent("reader_constructed");
    }
  );
  const restoreSyntheticReadiness = installSyntheticReadiness(true);
  let inspect = loadService();
  const restoreEnvironment = setEnvironment(environment());

  try {
    await test("hard-coded disabled readiness gate prevents authorization and reader construction", async () => {
      const restoreDisabledReadiness = installSyntheticReadiness(false);
      try {
        const disabledInspect = loadService();
        authorizationHarness.reset();
        readerHarness.reset();
        readCalls = 0;
        const result = await disabledInspect(identity(), token);
        assert.equal(result.status, "unavailable");
        assert.equal(authorizationHarness.calls(), 0);
        assert.equal(readerHarness.constructions(), 0);
        assert.equal(readCalls, 0);
        assertSafeResult(result);
      } finally {
        restoreDisabledReadiness();
        inspect = loadService();
      }
    });

    await test("disabled feature prevents authorization and reader construction", async () => {
      const restoreDisabled = setEnvironment(environment({ [FEATURE_SETTING]: "false" }));
      try {
        authorizationHarness.reset();
        readerHarness.reset();
        const result = await inspect(identity(), token);
        assert.equal(result.status, "unavailable");
        assert.equal(authorizationHarness.calls(), 0);
        assert.equal(readerHarness.constructions(), 0);
        assertSafeResult(result);
      } finally {
        restoreDisabled();
      }
    });

    await test("invalid identity fails closed before authorization or reader construction", async () => {
      const hostile = Object.defineProperty(
        { eventId: EVENT_ID, occurredAt: OCCURRED_AT },
        "visitorId",
        { enumerable: true, get: () => { throw new Error("sensitive identity error"); } }
      );
      const proxy = new Proxy(identity(), { ownKeys: () => { throw new Error("sensitive proxy error"); } });
      for (const candidate of [
        null,
        {},
        [],
        identity({ visitorId: " " }),
        identity({ occurredAt: "not-a-date" }),
        { ...identity(), unexpected: "value" },
        hostile,
        proxy
      ]) {
        authorizationHarness.reset();
        readerHarness.reset();
        const result = await inspect(
          candidate as FormationEventEvidenceAcquisitionIdentityV1,
          token
        );
        assert.notEqual(result.status, "matching_evidence");
        assert.equal(authorizationHarness.calls(), 0);
        assert.equal(readerHarness.constructions(), 0);
        assertSafeResult(result);
        assertNoSensitiveDetails(result, token);
      }
    });

    await test("disabled or malformed backend authorization configuration fails closed", async () => {
      for (const overrides of [
        { [FEATURE_SETTING]: undefined },
        { [FEATURE_SETTING]: "enabled" },
        { FEATURE_ENTRA_ADMIN_AUTHORIZATION: "false" },
        { HOPE_ADMIN_STAFF_IDS: undefined },
        { HOPE_ENTRA_API_AUDIENCE: undefined }
      ]) {
        const restoreCase = setEnvironment(environment(overrides));
        authorizationHarness.reset();
        readerHarness.reset();
        try {
          const result = await inspect(identity(), token);
          assert.equal(result.status, "unavailable");
          assert.equal(authorizationHarness.calls(), 0);
          assert.equal(readerHarness.constructions(), 0);
          assertSafeResult(result);
        } finally {
          restoreCase();
        }
      }
    });

    await test("missing and malformed access tokens fail before authorization", async () => {
      for (const candidate of [undefined, null, "", "   ", ` ${token}`, "not-a-jwt", "a.b.c="]) {
        authorizationHarness.reset();
        readerHarness.reset();
        const result = await inspect(identity(), candidate as string);
        assert.equal(result.status, "unavailable");
        assert.equal(authorizationHarness.calls(), 0);
        assert.equal(readerHarness.constructions(), 0);
        assertSafeResult(result);
        assertNoSensitiveDetails(result, token);
      }
    });

    await test("invalid token is denied by the existing authorization service before reader construction", async () => {
      authorizationHarness.reset();
      readerHarness.reset();
      const invalidCompactToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6InN5bnRoZXRpYyJ9.eyJ2ZXIiOiIyLjAifQ.invalidsignature";
      const result = await inspect(identity(), invalidCompactToken);
      assert.equal(result.status, "unavailable");
      assert.equal(authorizationHarness.calls(), 1);
      assert.equal(readerHarness.constructions(), 0);
      assert.deepEqual(events(), ["authorization_started", "authorization_resolved"]);
      assertSafeResult(result);
      assertNoSensitiveDetails(result, invalidCompactToken);
    });

    await test("malformed allowed decision from authorization cannot construct the reader", async () => {
      const authorizationModule = require.cache[AUTHORIZATION_PATH]!;
      const previousExports = authorizationModule.exports;
      authorizationModule.exports = {
        authorizeAuthenticatedStaffAction: async () => ({
          allowed: true,
          authenticatedStaffId: STAFF_ID,
          action: "system.admin",
          callerSuppliedProof: true
        })
      };
      authorizationHarness.reset();
      readerHarness.reset();
      try {
        const result = await inspect(identity(), token);
        assert.equal(result.status, "unavailable");
        assert.equal(authorizationHarness.calls(), 0);
        assert.equal(readerHarness.constructions(), 0);
        assertSafeResult(result);
        assertNoSensitiveDetails(result, token);
      } finally {
        authorizationModule.exports = previousExports;
      }
    });

    await test("inactive canonical staff and missing administrator membership remain denied by existing authorization", async () => {
      const cases = [
        {
          label: "inactive canonical staff",
          directoryValue: canonicalStaff({ status: "inactive" }),
          canonicalValue: canonicalStaff({ status: "inactive" }),
          administratorIds: STAFF_ID,
          expectedReason: "authentication_failed"
        },
        {
          label: "missing administrator membership",
          directoryValue: canonicalStaff(),
          canonicalValue: canonicalStaff(),
          administratorIds: "different-synthetic-admin",
          expectedReason: "insufficient_authority"
        }
      ];

      for (const item of cases) {
        directory = [item.directoryValue];
        canonicalIdentity = item.canonicalValue;
        const restoreCase = setEnvironment(environment({
          HOPE_ADMIN_STAFF_IDS: item.administratorIds
        }));
        authorizationHarness.reset();
        readerHarness.reset();
        try {
          const result = await inspect(identity(), token);
          assert.equal(result.status, "unavailable", item.label);
          assert.equal(authorizationHarness.calls(), 1, item.label);
          assert.deepEqual(authorizationHarness.outcomes(), [item.expectedReason], item.label);
          assert.equal(readerHarness.constructions(), 0, item.label);
          assert.equal(readCalls, 0, item.label);
          assert.deepEqual(events(), ["authorization_started", "authorization_resolved"]);
          assertSafeResult(result);
          assertNoSensitiveDetails(result, token);
        } finally {
          restoreCase();
        }
      }
      directory = [canonicalStaff()];
      canonicalIdentity = canonicalStaff();
    });

    await test("successful authorization resolves before one reader construction and one narrow read", async () => {
      authorizationHarness.reset();
      readerHarness.reset();
      readCalls = 0;
      const result = await inspect(identity(), token);
      assert.equal(result.status, "matching_evidence");
      assert.equal(authorizationHarness.calls(), 1);
      assert.equal(readerHarness.constructions(), 1);
      assert.equal(readCalls, 1);
      assert.equal(authorizationHarness.storageCalls(), 0);
      assert.equal(require.cache[AZURE_TABLES_PATH], undefined);
      assert.deepEqual(events(), [
        "authorization_started",
        "authorization_resolved",
        "reader_constructed",
        "read_started"
      ]);
      const [args] = authorizationHarness.observedArguments();
      assert.equal(args.length, 4);
      assert.equal(args[0], token);
      assert.equal((args[1] as { audience: string }).audience, AUDIENCE);
      assert.equal(args[2], "system.admin");
      assert.deepEqual(
        (args[3] as { administratorStaffIds: readonly string[] }).administratorStaffIds,
        [STAFF_ID]
      );
      assertSafeResult(result);
    });

    await test("reader-construction exception returns safe unavailable result", async () => {
      const previousFactory = require.cache[READER_FACTORY_PATH];
      const throwingFactory: ReaderFactory = () => {
        authorizationHarness.markEvent("reader_constructed");
        throw new Error(`synthetic-secret-reader-failure ${STAFF_ID} ${token}`);
      };
      const syntheticModule = new nodeModule.Module(READER_FACTORY_PATH);
      syntheticModule.filename = READER_FACTORY_PATH;
      syntheticModule.loaded = true;
      syntheticModule.exports = {
        createFormationEventV1BackendReadPort: throwingFactory
      };
      require.cache[READER_FACTORY_PATH] = syntheticModule;
      authorizationHarness.reset();
      readerHarness.reset();
      try {
        const result = await inspect(identity(), token);
        assert.equal(result.status, "unavailable");
        assert.equal(authorizationHarness.calls(), 1);
        assert.deepEqual(events(), [
          "authorization_started",
          "authorization_resolved",
          "reader_constructed"
        ]);
        const serialized = JSON.stringify(result);
        for (const secret of [STAFF_ID, token, "synthetic-secret-reader-failure"]) {
          assert.equal(serialized.includes(secret), false);
        }
        assertSafeResult(result);
      } finally {
        if (previousFactory) require.cache[READER_FACTORY_PATH] = previousFactory;
        else delete require.cache[READER_FACTORY_PATH];
      }
    });

    await test("read exception returns safe unavailable without retry", async () => {
      const previousFactory = require.cache[READER_FACTORY_PATH];
      let constructionCalls = 0;
      let failedReadCalls = 0;
      const failingFactory: ReaderFactory = () => {
        constructionCalls++;
        return {
          getEntity: async () => {
            failedReadCalls++;
            throw new Error(`synthetic-secret-read-failure ${STAFF_ID} ${token}`);
          }
        };
      };
      const syntheticModule = new nodeModule.Module(READER_FACTORY_PATH);
      syntheticModule.filename = READER_FACTORY_PATH;
      syntheticModule.loaded = true;
      syntheticModule.exports = {
        createFormationEventV1BackendReadPort: failingFactory
      };
      require.cache[READER_FACTORY_PATH] = syntheticModule;
      authorizationHarness.reset();
      readerHarness.reset();
      try {
        const result = await inspect(identity(), token);
        assert.equal(result.status, "unavailable");
        assert.equal(constructionCalls, 1);
        assert.equal(failedReadCalls, 1);
        assert.equal(authorizationHarness.calls(), 1);
        const serialized = JSON.stringify(result);
        for (const secret of [STAFF_ID, token, "synthetic-secret-read-failure"]) {
          assert.equal(serialized.includes(secret), false);
        }
        assertSafeResult(result);
      } finally {
        if (previousFactory) require.cache[READER_FACTORY_PATH] = previousFactory;
        else delete require.cache[READER_FACTORY_PATH];
      }
    });

    await test("authorization arguments and results expose no caller-supplied trust inputs", async () => {
      authorizationHarness.reset();
      readerHarness.reset();
      const result = await inspect(identity(), token);
      assert.equal(result.status, "matching_evidence");
      const [args] = authorizationHarness.observedArguments();
      assert.equal(args.length, 4);
      assert.equal(args[2], "system.admin");
      assert.equal(Object.prototype.hasOwnProperty.call(result, "authenticatedStaffId"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(result, "accessToken"), false);
      assertSafeResult(result);
    });

    await test("production-readiness contract remains blocked", () => {
      assert.equal(
        FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.productionBoundaryImplemented,
        false
      );
      assert.equal(
        FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.scope,
        "synthetic_only"
      );
    });

    console.log(`Passed ${passed} authorized backend-reader composition tests.`);
  } finally {
    restoreEnvironment();
    restoreSyntheticReadiness();
    readerHarness.restore();
    authorizationHarness.restore();
    delete require.cache[SERVICE_PATH];
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
