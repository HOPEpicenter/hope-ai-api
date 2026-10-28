import assert from "node:assert/strict";
import fs from "node:fs";
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
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import {
  authorizeAuthenticatedStaffAction,
  type AuthenticatedStaffActionDecision
} from "../../src/services/authorization/authorizeAuthenticatedStaffAction";
import type { EntraStaffTokenVerificationConfiguration } from "../../src/services/authorization/verifyEntraStaffAccessToken";
import {
  inspectFormationEventWithAuthenticatedAdmin,
  type AuthenticatedFormationEventInspectionDependencies,
  type TrustedAdminAuthorizationConfiguration
} from "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin";
import type { FormationEventEvidenceReadPort } from "../../src/services/formation/readFormationEventAcquisition";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STAFF_ID = "synthetic-canonical-admin-001";
const AUDIENCE = "api://hope-backend-synthetic-test";
const OCCURRED_AT = "2030-01-01T00:00:00.000Z";
const VISITOR_ID = "synthetic-visitor-001";
const EVENT_ID = "synthetic-event-001";
const ROW_KEY = makeDeterministicFormationEventRowKey(OCCURRED_AT, EVENT_ID);
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return {
    visitorId: VISITOR_ID,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    ...overrides
  } as FormationEventEvidenceAcquisitionIdentityV1;
}

function configuration(
  overrides: Record<string, unknown> = {}
): TrustedAdminAuthorizationConfiguration {
  return {
    enforcementEnabled: true,
    verificationConfiguration: {
      tenantId: TENANT_ID,
      audience: AUDIENCE,
      requiredPermissions: { scopes: ["staff.access"], roles: [] }
    },
    administratorStaffIds: [STAFF_ID],
    ...overrides
  } as TrustedAdminAuthorizationConfiguration;
}

function record(): Record<string, unknown> {
  return {
    partitionKey: VISITOR_ID,
    rowKey: ROW_KEY,
    visitorId: VISITOR_ID,
    id: EVENT_ID,
    occurredAt: OCCURRED_AT
  };
}

function readPort(
  getEntity: (partitionKey: string, rowKey: string) => Promise<unknown>
): FormationEventEvidenceReadPort {
  return { getEntity };
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

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "synthetic-formation-test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const localJwkSet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey = (header, token) => localJwkSet(header, token);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    ver: "2.0",
    tid: TENANT_ID,
    oid: OBJECT_ID,
    scp: "staff.access"
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-formation-test-key" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const authorizationDependencies = {
    resolveSigningKey,
    readStaffDirectory: async (): Promise<CanonicalStaffIdentity[]> => [canonicalStaff()],
    readCanonicalStaffIdentity: async (staffId: string): Promise<CanonicalStaffIdentity | null> =>
      staffId === STAFF_ID ? canonicalStaff() : null
  };
  const inspectionDependencies: AuthenticatedFormationEventInspectionDependencies = {
    authorizationDependencies
  };

  await test("real authorization service accepts synthetic signed token and reads exactly once", async () => {
    let reads = 0;
    const result = await inspectFormationEventWithAuthenticatedAdmin(
      identity(),
      token,
      configuration(),
      true,
      readPort(async () => { reads++; return record(); }),
      inspectionDependencies
    );
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
    assert.equal(reads, 1);
    assertSafety(result);
  });

  await test("a matching FormationEvent is returned as advisory evidence only", async () => {
    const result = await inspectFormationEventWithAuthenticatedAdmin(
      identity(),
      token,
      configuration(),
      true,
      readPort(async (partitionKey, rowKey) => {
        assert.equal(partitionKey, VISITOR_ID);
        assert.equal(rowKey, ROW_KEY);
        return record();
      }),
      inspectionDependencies
    );
    assert.equal(result.status, "matching_evidence");
    assertSafety(result);
  });

  await test("disabled or malformed enforcement and inspection enablement never authorize or read", async () => {
    const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
      throw new Error("authorization should not have been called");
    };
    const deps = { authorize: authorize as typeof authorizeAuthenticatedStaffAction };
    for (const config of [
      { verificationConfiguration: configuration().verificationConfiguration, administratorStaffIds: [STAFF_ID] },
      configuration({ enforcementEnabled: false }),
      configuration({ enforcementEnabled: "true" })
    ]) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, config as TrustedAdminAuthorizationConfiguration, true,
        readPort(async () => { reads++; return record(); }), deps
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
      assertSafety(result);
    }
    for (const enabled of [undefined, null, false, 1, "true", {}]) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration(), enabled as boolean,
        readPort(async () => { reads++; return record(); }), deps
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
      assertSafety(result);
    }
  });

  await test("missing, incomplete, malformed verification or administrator configuration fails before auth", async () => {
    let authorizations = 0;
    const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
      authorizations++;
      return { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" };
    };
    const deps = { authorize: authorize as typeof authorizeAuthenticatedStaffAction };
    const invalidConfigurations: unknown[] = [
      undefined,
      null,
      {},
      configuration({ verificationConfiguration: undefined }),
      configuration({ verificationConfiguration: { tenantId: "bad", audience: AUDIENCE, requiredPermissions: { scopes: ["staff.access"] } } }),
      configuration({ verificationConfiguration: { tenantId: TENANT_ID, audience: "", requiredPermissions: { scopes: ["staff.access"] } } }),
      configuration({ verificationConfiguration: { tenantId: TENANT_ID, audience: AUDIENCE, requiredPermissions: {} } }),
      configuration({ verificationConfiguration: { tenantId: TENANT_ID, audience: AUDIENCE, requiredPermissions: { scopes: ["bad scope"] } } }),
      configuration({ administratorStaffIds: [] }),
      configuration({ administratorStaffIds: ["", "  "] })
    ];
    for (const config of invalidConfigurations) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, config as TrustedAdminAuthorizationConfiguration, true,
        readPort(async () => { reads++; return record(); }), deps
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
    }
    assert.equal(authorizations, 0);
    assertSafety((await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration({ administratorStaffIds: [] }), true,
      readPort(async () => record()), deps
    )));
  });

  await test("missing, malformed, or whitespace-only access tokens fail closed", async () => {
    let authorizations = 0;
    const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
      authorizations++;
      return { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" };
    };
    const deps = { authorize: authorize as typeof authorizeAuthenticatedStaffAction };
    for (const accessToken of [undefined, null, "", "   ", ` ${token}`]) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), accessToken as string, configuration(), true,
        readPort(async () => { reads++; return record(); }), deps
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
    }
    assert.equal(authorizations, 0);
  });

  await test("each supported denied authorization decision prevents evidence reads", async () => {
    const reasons = [
      "unsupported_action",
      "authentication_failed",
      "actor_mismatch",
      "staff_identity_unavailable",
      "staff_binding_mismatch",
      "administrator_configuration_missing",
      "insufficient_authority"
    ] as const;
    for (const reason of reasons) {
      let reads = 0;
      let authorizations = 0;
      const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
        authorizations++;
        return { allowed: false, reason };
      };
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration(), true,
        readPort(async () => { reads++; return record(); }),
        { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
      );
      assert.equal(result.status, "unavailable", reason);
      assert.equal(reads, 0, reason);
      assert.equal(authorizations, 1, reason);
      assertSafety(result);
    }
  });

  await test("actual authenticated ordinary staff, canonical identity, and binding failures do not read", async () => {
    const cases = [
      {
        adminIds: ["different-canonical-staff"],
        canonical: canonicalStaff(),
        expectedReason: "insufficient_authority"
      },
      {
        adminIds: [STAFF_ID],
        canonical: canonicalStaff({ status: "inactive" }),
        expectedReason: "staff_identity_unavailable"
      },
      {
        adminIds: [STAFF_ID],
        canonical: canonicalStaff({ entraObjectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }),
        expectedReason: "staff_binding_mismatch"
      }
    ];
    for (const item of cases) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration({ administratorStaffIds: item.adminIds }), true,
        readPort(async () => { reads++; return record(); }),
        {
          authorizationDependencies: {
            ...authorizationDependencies,
            readCanonicalStaffIdentity: async () => item.canonical
          }
        }
      );
      assert.equal(result.status, "unavailable", item.expectedReason);
      assert.equal(reads, 0);
      assertSafety(result);
    }
  });

  await test("authorization exceptions, rejection, and invalid responses fail closed", async () => {
    const invalidResponses: unknown[] = [
      undefined,
      null,
      false,
      { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin", reason: "insufficient_authority" },
      { allowed: "true", authenticatedStaffId: STAFF_ID, action: "system.admin" },
      { allowed: true, authenticatedStaffId: " ", action: "system.admin" },
      { allowed: true, authenticatedStaffId: STAFF_ID, action: "staff.manage" },
      { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin", extra: true },
      { allowed: false, reason: "insufficient_authority", authenticatedStaffId: STAFF_ID },
      { allowed: false, reason: "unsupported_or_unknown" },
      new Proxy(
        { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" },
        { ownKeys() { throw new Error("decision proxy"); } }
      )
    ];
    for (const answer of invalidResponses) {
      let reads = 0;
      const authorize = async (): Promise<unknown> => answer;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration(), true,
        readPort(async () => { reads++; return record(); }),
        { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
    }
    for (const authorize of [
      async (): Promise<AuthenticatedStaffActionDecision> => { throw new Error("synthetic authorization failure"); },
      async (): Promise<AuthenticatedStaffActionDecision> => Promise.reject(new Error("synthetic rejected authorization"))
    ]) {
      let reads = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration(), true,
        readPort(async () => { reads++; return record(); }),
        { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
      );
      assert.equal(result.status, "unavailable");
      assert.equal(reads, 0);
      assertSafety(result);
    }
  });

  await test("unexpected properties, accessors, inherited values, proxies, arrays, and hostile inputs fail closed", async () => {
    const unexpected = { ...configuration(), unexpected: true };
    const inherited = Object.create(configuration());
    const accessor = Object.create(null);
    Object.defineProperty(accessor, "enforcementEnabled", { get() { throw new Error("getter"); } });
    const hostileProxy = new Proxy(configuration(), {
      ownKeys() { throw new Error("proxy trap"); }
    });
    for (const config of [unexpected, inherited, accessor, hostileProxy, []]) {
      let authorizations = 0;
      let reads = 0;
      const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
        authorizations++;
        return { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" };
      };
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, config as TrustedAdminAuthorizationConfiguration, true,
        readPort(async () => { reads++; return record(); }),
        { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
      );
      assert.notEqual(result.status, "matching_evidence");
      assert.equal(authorizations, 0);
      assert.equal(reads, 0);
      assertSafety(result);
    }

    const hostileDecision = Object.defineProperty({}, "allowed", {
      get() { throw new Error("decision getter"); }
    });
    const hostileAuthorize = async (): Promise<unknown> => hostileDecision;
    const result = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration(), true,
      readPort(async () => record()),
      { authorize: hostileAuthorize as typeof authorizeAuthenticatedStaffAction }
    );
    assert.equal(result.status, "unavailable");
    assertSafety(result);
  });

  await test("invalid identity is fail-closed without authorization or evidence access", async () => {
    let authorizations = 0;
    let reads = 0;
    const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
      authorizations++;
      return { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin" };
    };
    const invalidIdentities = [
      undefined,
      null,
      {},
      identity({ visitorId: " " }),
      identity({ eventId: "" }),
      identity({ occurredAt: "not-a-time" }),
      Object.defineProperty({ eventId: EVENT_ID, occurredAt: OCCURRED_AT }, "visitorId", {
        get() { throw new Error("identity getter"); }
      })
    ];
    for (const identityValue of invalidIdentities) {
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identityValue as FormationEventEvidenceAcquisitionIdentityV1,
        token, configuration(), true,
        readPort(async () => { reads++; return record(); }),
        { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
      );
      assert.notEqual(result.status, "matching_evidence");
      assert.equal(reads, 0);
      assertSafety(result);
    }
    assert.equal(authorizations, 0);
  });

  await test("observed EntityNotFound is non-authoritative absence; storage errors remain unavailable", async () => {
    let reads = 0;
    const absent = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration(), true,
      readPort(async () => {
        reads++;
        throw Object.assign(new Error("synthetic 404"), { status: 404, code: "EntityNotFound" });
      }),
      inspectionDependencies
    );
    assert.equal(absent.status, "observed_absence");
    assert.equal(absent.reasonCode, "absence_observed_not_historical");
    assert.equal(absent.historicalAbsenceEstablished, false);
    assert.equal(reads, 1);

    for (const error of [
      Object.assign(new Error("synthetic table error"), { status: 404, code: "TableNotFound" }),
      Object.assign(new Error("synthetic conflicting error"), {
        status: 404,
        code: "EntityNotFound",
        details: { status: 503, code: "ServiceUnavailable" }
      }),
      new Error("synthetic reader exception")
    ]) {
      let attempts = 0;
      const result = await inspectFormationEventWithAuthenticatedAdmin(
        identity(), token, configuration(), true,
        readPort(async () => { attempts++; throw error; }),
        inspectionDependencies
      );
      assert.equal(result.status, "unavailable");
      assert.equal(attempts, 1);
      assertSafety(result);
    }
    assertSafety(absent);
  });

  await test("invalid reader and malformed partial observation fail closed after at most one read", async () => {
    const invalidReader = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration(), true,
      null as unknown as FormationEventEvidenceReadPort,
      inspectionDependencies
    );
    assert.equal(invalidReader.status, "unavailable");
    assertSafety(invalidReader);

    let calls = 0;
    const malformedResult = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration(), true,
      readPort(async () => { calls++; return { partitionKey: VISITOR_ID }; }),
      inspectionDependencies
    );
    assert.equal(malformedResult.status, "ambiguous");
    assert.equal(calls, 1);
    assertSafety(malformedResult);
  });

  await test("authorization and evidence are each invoked at most once; decision mutation cannot alter outcome", async () => {
    const decision: AuthenticatedStaffActionDecision = {
      allowed: true,
      authenticatedStaffId: STAFF_ID,
      action: "system.admin"
    };
    let authorizations = 0;
    let reads = 0;
    const authorize = async (): Promise<AuthenticatedStaffActionDecision> => {
      authorizations++;
      return decision;
    };
    const result = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, configuration(), true,
      readPort(async () => {
        reads++;
        (decision as { allowed: boolean }).allowed = false;
        return record();
      }),
      { authorize: authorize as typeof authorizeAuthenticatedStaffAction }
    );
    assert.equal(authorizations, 1);
    assert.equal(reads, 1);
    assert.equal(result.status, "matching_evidence");
    assertSafety(result);
  });

  await test("inspection results never expose token, staff ID, or authorization configuration", async () => {
    const secretConfiguration = configuration({
      verificationConfiguration: {
        tenantId: TENANT_ID,
        audience: "synthetic-secret-audience",
        requiredPermissions: { scopes: ["staff.access"], roles: [] }
      }
    });
    const result = await inspectFormationEventWithAuthenticatedAdmin(
      identity(), token, secretConfiguration, true,
      readPort(async () => record()),
      inspectionDependencies
    );
    const serialized = JSON.stringify(result);
    for (const secret of [token, STAFF_ID, TENANT_ID, "synthetic-secret-audience"]) {
      assert.equal(serialized.includes(secret), false);
    }
    assertSafety(result);
  });

  await test("service source introduces no environment, network, Azure-client, route, or writer dependency", () => {
    const source = fs.readFileSync(
      "src/services/formation/inspectFormationEventWithAuthenticatedAdmin.ts",
      "utf8"
    );
    for (const forbidden of ["process.env", "fetch(", "AzureTableClient", "app.http(", "recordFormationEvent"]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });

  console.log(`Passed ${passed} synthetic authenticated-admin inspection tests.`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
