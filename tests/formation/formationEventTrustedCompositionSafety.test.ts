import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import type {
  AuthenticatedStaffActionDecision
} from "../../src/services/authorization/authorizeAuthenticatedStaffAction";
import type {
  FormationEventInspectionAuthorizationConfiguration
} from "../../src/config/formationEventInspectionAuthorization";
import type {
  TrustedAdminAuthorizationConfiguration
} from "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";
import { inspectFormationEventWithAdminDecision } from "../../src/services/formation/inspectFormationEventWithAdminDecision";
import {
  createSyntheticFormationEventV1BackendReadPort
} from "../../src/services/formation/createFormationEventV1BackendReadPort";
import type { FormationEventEvidenceReadPort } from "../../src/services/formation/readFormationEventAcquisition";

type SyntheticInvocation = (
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string,
  readPort: FormationEventEvidenceReadPort
) => Promise<FormationEventEvidenceAcquisitionResultV1>;
type SyntheticInvocationFactory = typeof import("../../src/services/formation/inspectFormationEventWithTrustedInvocation")
  .createSyntheticTrustedFormationEventInspectionInvocation;

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF_ID = "synthetic-trusted-composition-admin";
const VISITOR_ID = "synthetic-trusted-composition-visitor";
const EVENT_ID = "synthetic-trusted-composition-event";
const OCCURRED_AT = "2030-04-05T06:07:08.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(OCCURRED_AT, EVENT_ID);

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return {
    visitorId: VISITOR_ID,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    ...overrides
  } as FormationEventEvidenceAcquisitionIdentityV1;
}

function authorizationConfiguration(): TrustedAdminAuthorizationConfiguration {
  return {
    enforcementEnabled: true,
    verificationConfiguration: {
      tenantId: TENANT_ID,
      audience: "api://synthetic-trusted-composition",
      requiredPermissions: { scopes: ["staff.access"], roles: [] }
    },
    administratorStaffIds: [STAFF_ID]
  };
}

function enabledConfiguration(): FormationEventInspectionAuthorizationConfiguration {
  return {
    evidenceInspectionEnabled: true,
    authorizationConfiguration: authorizationConfiguration()
  };
}

function evidenceRecord(): Record<string, unknown> {
  return {
    partitionKey: VISITOR_ID,
    rowKey: ROW_KEY,
    visitorId: VISITOR_ID,
    idempotencyKey: EVENT_ID,
    occurredAt: OCCURRED_AT
  };
}

function assertAdvisory(result: FormationEventEvidenceAcquisitionResultV1): void {
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

function makeSyntheticReadPort(
  getEntity: (partitionKey: string, rowKey: string) => Promise<unknown>
): FormationEventEvidenceReadPort {
  return createSyntheticFormationEventV1BackendReadPort(() => ({ getEntity }));
}

type AuthorizationOutcome = (
  accessToken: string,
  action: unknown
) => Promise<AuthenticatedStaffActionDecision>;

type SyntheticExecution = (
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string,
  authorizationConfiguration: TrustedAdminAuthorizationConfiguration,
  evidenceInspectionEnabled: boolean,
  readPort: FormationEventEvidenceReadPort
) => Promise<FormationEventEvidenceAcquisitionResultV1>;

function loadSyntheticInvocationFactory(): SyntheticInvocationFactory {
  const module = require("module") as typeof import("module");
  const authenticatedAdminPath = require.resolve(
    "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin"
  );
  const invocationPath = require.resolve(
    "../../src/services/formation/inspectFormationEventWithTrustedInvocation"
  );
  const previousAuthenticatedAdminModule = require.cache[authenticatedAdminPath];
  const previousInvocationModule = require.cache[invocationPath];
  const syntheticAuthenticatedAdminModule = new module.Module(authenticatedAdminPath);
  syntheticAuthenticatedAdminModule.filename = authenticatedAdminPath;
  syntheticAuthenticatedAdminModule.loaded = true;
  syntheticAuthenticatedAdminModule.exports = {
    inspectFormationEventWithAuthenticatedAdmin: async () => {
      throw new Error("synthetic trusted-invocation executor should be injected");
    }
  };
  require.cache[authenticatedAdminPath] = syntheticAuthenticatedAdminModule;
  delete require.cache[invocationPath];

  try {
    const invocation = require(invocationPath) as {
      createSyntheticTrustedFormationEventInspectionInvocation: SyntheticInvocationFactory;
    };
    return invocation.createSyntheticTrustedFormationEventInspectionInvocation;
  } finally {
    if (previousAuthenticatedAdminModule) {
      require.cache[authenticatedAdminPath] = previousAuthenticatedAdminModule;
    } else {
      delete require.cache[authenticatedAdminPath];
    }
    if (previousInvocationModule) require.cache[invocationPath] = previousInvocationModule;
  }
}

const createSyntheticTrustedFormationEventInspectionInvocation =
  loadSyntheticInvocationFactory();

function makeInvocation(
  configuration: FormationEventInspectionAuthorizationConfiguration,
  authorize: AuthorizationOutcome
): {
  invoke: SyntheticInvocation;
  configurationReads: () => number;
  executionCalls: () => number;
  authorizationCalls: () => number;
  observedActions: () => unknown[];
  observedAuthorizationConfigurations: () => TrustedAdminAuthorizationConfiguration[];
} {
  let configurationReadCount = 0;
  let executionCallCount = 0;
  let authorizationCallCount = 0;
  const observedActions: unknown[] = [];
  const observedAuthorizationConfigurations: TrustedAdminAuthorizationConfiguration[] = [];

  const execute: SyntheticExecution = async (
    eventIdentity: FormationEventEvidenceAcquisitionIdentityV1,
    accessToken: string,
    _authorizationConfiguration: TrustedAdminAuthorizationConfiguration,
    enabled: boolean,
    readPort: FormationEventEvidenceReadPort
  ) => {
    executionCallCount++;
    observedAuthorizationConfigurations.push(_authorizationConfiguration);
    authorizationCallCount++;
    observedActions.push("system.admin");
    const decision = await authorize(accessToken, "system.admin");
    return inspectFormationEventWithAdminDecision(
      eventIdentity,
      decision,
      enabled,
      readPort
    );
  };

  return {
    invoke: createSyntheticTrustedFormationEventInspectionInvocation(
      () => {
        configurationReadCount++;
        return configuration;
      },
      execute
    ),
    configurationReads: () => configurationReadCount,
    executionCalls: () => executionCallCount,
    authorizationCalls: () => authorizationCallCount,
    observedActions: () => observedActions,
    observedAuthorizationConfigurations: () => observedAuthorizationConfigurations
  };
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  await test("disabled configuration prevents authenticated execution, authorization, and read-port use", async () => {
    let readerConstructions = 0;
    let reads = 0;
    const readPort = makeSyntheticReadPort(async () => {
      reads++;
      return evidenceRecord();
    });
    readerConstructions++;

    const harness = makeInvocation(
      { evidenceInspectionEnabled: false },
      async () => {
        assert.fail("disabled configuration must not authorize");
      }
    );
    const result = await harness.invoke(identity(), "synthetic-token", readPort);

    assert.equal(result.status, "unavailable");
    assert.equal(harness.configurationReads(), 1);
    assert.equal(harness.executionCalls(), 0);
    assert.equal(harness.authorizationCalls(), 0);
    assert.equal(reads, 0);
    assert.equal(readerConstructions, 1);
    assertAdvisory(result);
  });

  await test("invalid identity fails closed before authorization or evidence read", async () => {
    let reads = 0;
    const harness = makeInvocation(enabledConfiguration(), async () => {
      assert.fail("invalid identity must not reach authorization");
    });
    const invalidIdentities: unknown[] = [
      null,
      {},
      identity({ visitorId: "visitor/invalid" }),
      identity({ eventId: "" }),
      identity({ occurredAt: "not-a-timestamp" })
    ];

    for (const invalidIdentity of invalidIdentities) {
      const readPort = makeSyntheticReadPort(async () => {
        reads++;
        return evidenceRecord();
      });
      const result = await harness.invoke(invalidIdentity as FormationEventEvidenceAcquisitionIdentityV1, "synthetic-token", readPort);
      assert.equal(result.status, "ambiguous");
    }

    assert.equal(harness.configurationReads(), invalidIdentities.length);
    assert.equal(harness.executionCalls(), 0);
    assert.equal(harness.authorizationCalls(), 0);
    assert.equal(reads, 0);
  });

  await test("synthetic authenticated execution rejects missing and malformed tokens before evidence reads", async () => {
    let reads = 0;
    const harness = makeInvocation(enabledConfiguration(), async token => {
      if (typeof token !== "string" || token.length === 0 || token.trim() !== token) {
        return { allowed: false, reason: "authentication_failed" };
      }
      assert.fail("invalid token must be rejected before this synthetic authorization seam");
    });

    for (const token of [undefined, null, "", "   ", " synthetic-token", 23, {}]) {
      const readPort = makeSyntheticReadPort(async () => {
        reads++;
        return evidenceRecord();
      });
      const result = await harness.invoke(identity(), token as string, readPort);
      assert.equal(result.status, "unavailable");
      assertAdvisory(result);
    }

    assert.equal(harness.executionCalls(), 7);
    assert.equal(harness.authorizationCalls(), 7);
    assert.equal(reads, 0);
  });

  await test("rejected, inactive, noncanonical, or insufficient authorization never reaches storage", async () => {
    const rejected: Array<[string, AuthenticatedStaffActionDecision]> = [
      ["authorization rejected", { allowed: false, reason: "authentication_failed" }],
      ["inactive canonical staff", { allowed: false, reason: "staff_identity_unavailable" }],
      ["noncanonical staff binding", { allowed: false, reason: "staff_binding_mismatch" }],
      ["not a configured administrator", { allowed: false, reason: "insufficient_authority" }]
    ];

    for (const [label, decision] of rejected) {
      let reads = 0;
      const harness = makeInvocation(enabledConfiguration(), async () => decision);
      const result = await harness.invoke(
        identity(),
        "synthetic-token",
        makeSyntheticReadPort(async () => {
          reads++;
          return evidenceRecord();
        })
      );

      assert.equal(result.status, "unavailable", label);
      assert.equal(harness.executionCalls(), 1, label);
      assert.equal(harness.authorizationCalls(), 1, label);
      assert.deepEqual(harness.observedActions(), ["system.admin"], label);
      assert.equal(reads, 0, label);
      assertAdvisory(result);
    }
  });

  await test("valid synthetic system.admin authorization performs exactly one narrow advisory acquisition read", async () => {
    let reads = 0;
    const forwarded: Array<[string, string]> = [];
    const harness = makeInvocation(enabledConfiguration(), async (accessToken, action) => {
      assert.equal(accessToken, "synthetic-token");
      assert.equal(action, "system.admin");
      return {
        allowed: true,
        authenticatedStaffId: STAFF_ID,
        action: "system.admin"
      };
    });
    const readPort = makeSyntheticReadPort(async (partitionKey, rowKey) => {
      reads++;
      forwarded.push([partitionKey, rowKey]);
      return evidenceRecord();
    });

    const result = await harness.invoke(identity(), "synthetic-token", readPort);

    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
    assert.equal(result.candidateRowKey, ROW_KEY);
    assert.equal(harness.executionCalls(), 1);
    assert.equal(harness.authorizationCalls(), 1);
    assert.equal(reads, 1);
    assert.deepEqual(forwarded, [[VISITOR_ID, ROW_KEY]]);
    assertAdvisory(result);
  });

  await test("authorization rejection and unavailable reader errors remain fail-closed without retry", async () => {
    const outcomes: Array<{
      label: string;
      read: () => Promise<unknown>;
      expectedStatus: FormationEventEvidenceAcquisitionResultV1["status"];
      expectedReason: FormationEventEvidenceAcquisitionResultV1["reasonCode"];
    }> = [
      {
        label: "ordinary storage failure",
        read: async () => { throw new Error("synthetic storage unavailable"); },
        expectedStatus: "unavailable",
        expectedReason: "observation_unavailable"
      },
      {
        label: "verified entity absence",
        read: async () => { throw { statusCode: 404, code: "EntityNotFound" }; },
        expectedStatus: "observed_absence",
        expectedReason: "absence_observed_not_historical"
      },
      {
        label: "table absence",
        read: async () => { throw { statusCode: 404, code: "TableNotFound" }; },
        expectedStatus: "unavailable",
        expectedReason: "observation_unavailable"
      }
    ];

    for (const outcome of outcomes) {
      let reads = 0;
      const harness = makeInvocation(enabledConfiguration(), async () => ({
        allowed: true,
        authenticatedStaffId: STAFF_ID,
        action: "system.admin"
      }));
      const result = await harness.invoke(identity(), "synthetic-token", makeSyntheticReadPort(async () => {
        reads++;
        return outcome.read();
      }));

      assert.equal(result.status, outcome.expectedStatus, outcome.label);
      assert.equal(result.reasonCode, outcome.expectedReason, outcome.label);
      assert.equal(reads, 1, outcome.label);
      assert.equal(result.historicalAbsenceEstablished, false, outcome.label);
      assertAdvisory(result);
    }

    let deniedReads = 0;
    const deniedHarness = makeInvocation(enabledConfiguration(), async () => ({
      allowed: false,
      reason: "insufficient_authority"
    }));
    const denied = await deniedHarness.invoke(identity(), "synthetic-token", makeSyntheticReadPort(async () => {
      deniedReads++;
      throw new Error("reader should not be called");
    }));
    assert.equal(denied.status, "unavailable");
    assert.equal(deniedReads, 0);
    assertAdvisory(denied);
  });

  await test("synthetic backend seam exposes only getEntity and never returns its injected client", async () => {
    let reads = 0;
    const injectedClient = {
      getEntity: async (partitionKey: string, rowKey: string): Promise<unknown> => {
        assert.equal(partitionKey, VISITOR_ID);
        assert.equal(rowKey, ROW_KEY);
        reads++;
        return evidenceRecord();
      }
    };
    const readPort = createSyntheticFormationEventV1BackendReadPort(() => injectedClient);

    assert.deepEqual(Reflect.ownKeys(readPort), ["getEntity"]);
    assert.equal(typeof readPort.getEntity, "function");
    assert.notEqual(readPort, injectedClient);
    assert.notEqual(readPort.getEntity, injectedClient.getEntity);

    const result = await import("../../src/services/formation/readFormationEventAcquisition")
      .then(({ readFormationEventAcquisition }) =>
        readFormationEventAcquisition(identity(), readPort)
      );
    assert.equal(result.status, "matching_evidence");
    assert.equal(reads, 1);
    assertAdvisory(result);
  });

  await test("trusted invocation cannot accept caller-supplied authorization or configuration overrides", async () => {
    let reads = 0;
    let forgedAuthorizationCalls = 0;
    const forgedCallerData = {
      evidenceInspectionEnabled: true,
      authorizationConfiguration: authorizationConfiguration(),
      authorizationDecision: {
        allowed: true,
        authenticatedStaffId: STAFF_ID,
        action: "system.admin"
      },
      authorizationDependencies: {
        authorize: async () => {
          forgedAuthorizationCalls++;
          return { allowed: true };
        }
      }
    };

    const harness = makeInvocation(enabledConfiguration(), async () => {
      return {
        allowed: true,
        authenticatedStaffId: STAFF_ID,
        action: "system.admin"
      };
    });
    const result = await (
      harness.invoke as unknown as (
        ...args: unknown[]
      ) => Promise<FormationEventEvidenceAcquisitionResultV1>
    )(
      identity(),
      "synthetic-token",
      makeSyntheticReadPort(async () => {
        reads++;
        return evidenceRecord();
      }),
      forgedCallerData
    );

    assert.equal(result.status, "matching_evidence");
    assert.equal(reads, 1);
    assert.equal(harness.configurationReads(), 1);
    assert.equal(harness.executionCalls(), 1);
    assert.deepEqual(
      harness.observedAuthorizationConfigurations(),
      [authorizationConfiguration()]
    );
    assert.equal(forgedAuthorizationCalls, 0);
    assertAdvisory(result);

    const forgedIdentityResult = await harness.invoke(
      identity({ authorizationDecision: forgedCallerData.authorizationDecision }),
      "synthetic-token",
      makeSyntheticReadPort(async () => {
        reads++;
        return evidenceRecord();
      })
    );
    assert.equal(forgedIdentityResult.status, "ambiguous");
    assert.equal(harness.executionCalls(), 1);
    assert.equal(harness.authorizationCalls(), 1);
    assert.equal(reads, 1);
    assert.equal(forgedAuthorizationCalls, 0);
  });

  await test("production-shaped trusted invocation interface accepts identity, token, and reader only", () => {
    const invocationPath = path.resolve(
      process.cwd(),
      "src/services/formation/inspectFormationEventWithTrustedInvocation.ts"
    );
    const source = fs.readFileSync(invocationPath, "utf8");

    assert.match(
      source,
      /export function inspectFormationEventWithTrustedInvocation\(\s*identity:\s*FormationEventEvidenceAcquisitionIdentityV1,\s*accessToken:\s*string,\s*readPort:\s*FormationEventEvidenceReadPort\s*\)/
    );
    assert.doesNotMatch(
      source,
      /export function inspectFormationEventWithTrustedInvocation\([\s\S]*?(?:authorizationDecision|authorizationConfiguration|dependencies|featureEnabled)\s*:/
    );
  });

  await test("contract remains explicitly synthetic and production trust requirements are not marked implemented", () => {
    const contractPath = path.resolve(
      process.cwd(),
      "src/services/formation/formationEventProductionReadBoundaryContract.ts"
    );
    const contractSource = fs.readFileSync(contractPath, "utf8");

    assert.match(contractSource, /scope: "synthetic_only"/);
    assert.match(contractSource, /productionBoundaryImplemented: false/);
  });

  console.log(`Passed ${passed} synthetic FormationEvent trusted-composition safety tests.`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
