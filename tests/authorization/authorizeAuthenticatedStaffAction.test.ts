import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import {
  authorizeAuthenticatedStaffAction,
  type AuthenticatedStaffAuthorizationConfiguration
} from "../../src/services/authorization/authorizeAuthenticatedStaffAction";
import type { EntraStaffTokenVerificationConfiguration } from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_OBJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CANONICAL_ADMIN_ID = "canonical-admin-123";
const API_AUDIENCE = "api://hope-backend-test";
const API_SCOPE = "staff.access";
const ISSUER =
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

function verificationConfiguration(
  overrides: Partial<EntraStaffTokenVerificationConfiguration> = {}
): EntraStaffTokenVerificationConfiguration {
  return {
    tenantId: TENANT_ID,
    audience: API_AUDIENCE,
    requiredPermissions: {
      scopes: [API_SCOPE],
      roles: []
    },
    ...overrides
  };
}

function staffIdentity(
  overrides: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: CANONICAL_ADMIN_ID,
    displayName: "Test Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "event-1",
    entraTenantId: TENANT_ID,
    entraObjectId: OBJECT_ID,
    email: "test@example.invalid",
    phone: null,
    ministryAreaId: "area-1",
    ...overrides
  };
}

async function run(): Promise<void> {
  const { privateKey, publicKey } =
    await generateKeyPair("RS256");
  const { privateKey: otherPrivateKey } =
    await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "authorization-test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const localKeySet = createLocalJWKSet({
    keys: [publicJwk]
  });
  const resolveSigningKey: JWTVerifyGetKey = (header, token) =>
    localKeySet(header, token);
  const now = Math.floor(Date.now() / 1000);

  async function createToken(options: {
    signingKey?: CryptoKey;
    audience?: string;
    issuer?: string;
    tenantId?: string;
    objectId?: string;
    scope?: string;
    roles?: string[];
    expiration?: number;
  } = {}): Promise<string> {
    return new SignJWT({
      ver: "2.0",
      tid: options.tenantId ?? TENANT_ID,
      oid: options.objectId ?? OBJECT_ID,
      scp: options.scope ?? API_SCOPE,
      ...(options.roles ? { roles: options.roles } : {})
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "authorization-test-key"
      })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? API_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(options.expiration ?? now + 3600)
      .sign(options.signingKey ?? privateKey);
  }

  const validToken = await createToken();
  const verification = verificationConfiguration();
  const adminConfiguration: AuthenticatedStaffAuthorizationConfiguration = {
    administratorStaffIds: [CANONICAL_ADMIN_ID]
  };
  let staffDirectoryReads = 0;
  let identityReads = 0;
  const dependencies = {
    resolveSigningKey,
    readStaffDirectory: async (): Promise<CanonicalStaffIdentity[]> => {
      staffDirectoryReads += 1;
      return [staffIdentity()];
    },
    readCanonicalStaffIdentity: async (
      staffId: string
    ): Promise<CanonicalStaffIdentity | null> => {
      identityReads += 1;
      return staffId === CANONICAL_ADMIN_ID
        ? staffIdentity()
        : null;
    }
  };

  const allowed = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.admin",
    adminConfiguration,
    undefined,
    dependencies
  );
  assert.deepEqual(allowed, {
    allowed: true,
    authenticatedStaffId: CANONICAL_ADMIN_ID,
    action: "system.admin"
  });
  assert.equal(staffDirectoryReads, 1);
  assert.equal(identityReads, 1);
  assert.equal("roleLabel" in allowed, false);
  assert.equal("scope" in allowed, false);

  const ordinaryStaff = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.admin",
    { administratorStaffIds: ["another-canonical-staff"] },
    undefined,
    dependencies
  );
  assert.deepEqual(ordinaryStaff, {
    allowed: false,
    reason: "insufficient_authority"
  });

  for (const authorizationConfiguration of [
    undefined,
    {},
    { administratorStaffIds: [] }
  ]) {
    const missingAdministrators =
      await authorizeAuthenticatedStaffAction(
        validToken,
        verification,
        "system.admin",
        authorizationConfiguration,
        undefined,
        dependencies
      );
    assert.deepEqual(missingAdministrators, {
      allowed: false,
      reason: "administrator_configuration_missing"
    });
  }

  for (const status of ["inactive", "pending"] as const) {
    const inactiveStaff = await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      {
        ...dependencies,
        readCanonicalStaffIdentity: async () =>
          staffIdentity({ status })
      }
    );
    assert.deepEqual(inactiveStaff, {
      allowed: false,
      reason: "staff_identity_unavailable"
    });
  }

  for (const unknownOrMalformedIdentity of [
    null,
    staffIdentity({ staffId: "" }),
    staffIdentity({ entraTenantId: "not-a-guid" }),
    staffIdentity({ entraTenantId: OTHER_TENANT_ID })
  ]) {
    const denied = await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      {
        ...dependencies,
        readCanonicalStaffIdentity: async () =>
          unknownOrMalformedIdentity
      }
    );
    assert.equal(denied.allowed, false);
  }

  const changedCanonicalBinding =
    await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      {
        ...dependencies,
        readCanonicalStaffIdentity: async () =>
          staffIdentity({ entraObjectId: OTHER_OBJECT_ID })
      }
    );
  assert.deepEqual(changedCanonicalBinding, {
    allowed: false,
    reason: "staff_binding_mismatch"
  });

  const identityReadsBeforeActorMismatch = identityReads;
  const mismatchedActor = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.admin",
    adminConfiguration,
    "attacker-selected-staff",
    dependencies
  );
  assert.deepEqual(mismatchedActor, {
    allowed: false,
    reason: "actor_mismatch"
  });
  assert.equal(identityReads, identityReadsBeforeActorMismatch);

  const clientSuppliedAdminClaim =
    await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      {
        staffId: CANONICAL_ADMIN_ID,
        isAdministrator: true
      },
      dependencies
    );
  assert.deepEqual(clientSuppliedAdminClaim, {
    allowed: false,
    reason: "actor_mismatch"
  });

  const matchingActor = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.admin",
    adminConfiguration,
    CANONICAL_ADMIN_ID,
    dependencies
  );
  assert.deepEqual(matchingActor, {
    allowed: true,
    authenticatedStaffId: CANONICAL_ADMIN_ID,
    action: "system.admin"
  });

  const tokenWithAdminRole = await createToken({
    roles: ["system.admin"]
  });
  const administratorRoleWithoutConfiguredMembership =
    await authorizeAuthenticatedStaffAction(
      tokenWithAdminRole,
      verificationConfiguration({
        requiredPermissions: {
          scopes: [API_SCOPE],
          roles: ["system.admin"]
        }
      }),
      "system.admin",
      { administratorStaffIds: ["someone-else"] },
      undefined,
      {
        ...dependencies,
        readCanonicalStaffIdentity: async () =>
          staffIdentity({ roleLabel: "Administrator" })
      }
    );
  assert.deepEqual(administratorRoleWithoutConfiguredMembership, {
    allowed: false,
    reason: "insufficient_authority"
  });

  const tokenWithClientAdminRole = await createToken({
    roles: ["system.admin"],
    scope: ""
  });
  const roleOnlyWithoutAdminMembership =
    await authorizeAuthenticatedStaffAction(
      tokenWithClientAdminRole,
      verificationConfiguration({
        requiredPermissions: {
          scopes: [],
          roles: ["system.admin"]
        }
      }),
      "system.admin",
      { administratorStaffIds: ["someone-else"] },
      undefined,
      dependencies
    );
  assert.deepEqual(roleOnlyWithoutAdminMembership, {
    allowed: false,
    reason: "insufficient_authority"
  });

  const unknownAction = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.root",
    adminConfiguration,
    undefined,
    dependencies
  );
  assert.deepEqual(unknownAction, {
    allowed: false,
    reason: "unsupported_action"
  });
  const pastoralAction = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "pastoral_notes.view",
    adminConfiguration,
    undefined,
    dependencies
  );
  assert.deepEqual(pastoralAction, {
    allowed: false,
    reason: "unsupported_action"
  });

  const invalidSignatureToken = await createToken({
    signingKey: otherPrivateKey
  });
  let invalidSignatureDirectoryReads = 0;
  const invalidSignature = await authorizeAuthenticatedStaffAction(
    invalidSignatureToken,
    verification,
    "system.admin",
    adminConfiguration,
    undefined,
    {
      ...dependencies,
      readStaffDirectory: async () => {
        invalidSignatureDirectoryReads += 1;
        return [staffIdentity()];
      }
    }
  );
  assert.deepEqual(invalidSignature, {
    allowed: false,
    reason: "authentication_failed"
  });
  assert.equal(invalidSignatureDirectoryReads, 0);

  const expiredToken = await createToken({
    expiration: now - 60
  });
  const expired = await authorizeAuthenticatedStaffAction(
    expiredToken,
    verification,
    "system.admin",
    adminConfiguration,
    undefined,
    dependencies
  );
  assert.deepEqual(expired, {
    allowed: false,
    reason: "authentication_failed"
  });

  for (const options of [
    { audience: "api://wrong-audience" },
    { tenantId: OTHER_TENANT_ID },
    { issuer: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0` }
  ]) {
    const invalidToken = await createToken(options);
    const denied = await authorizeAuthenticatedStaffAction(
      invalidToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      dependencies
    );
    assert.deepEqual(denied, {
      allowed: false,
      reason: "authentication_failed"
    });
  }

  const duplicateBindings = await authorizeAuthenticatedStaffAction(
    validToken,
    verification,
    "system.admin",
    adminConfiguration,
    undefined,
    {
      ...dependencies,
      readStaffDirectory: async () => [
        staffIdentity(),
        staffIdentity({
          staffId: "duplicate-canonical-staff",
          status: "inactive"
        })
      ]
    }
  );
  assert.deepEqual(duplicateBindings, {
    allowed: false,
    reason: "authentication_failed"
  });

  const canonicalDirectoryFailure =
    await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      {
        ...dependencies,
        readCanonicalStaffIdentity: async () => {
          throw new Error("private directory details");
        }
      }
    );
  assert.deepEqual(canonicalDirectoryFailure, {
    allowed: false,
    reason: "staff_identity_unavailable"
  });

  const resolvedIdentityFailure =
    await authorizeAuthenticatedStaffAction(
      validToken,
      verification,
      "system.admin",
      adminConfiguration,
      undefined,
      {
        ...dependencies,
        readStaffDirectory: async () => {
          throw new Error("private resolver details");
        }
      }
    );
  assert.deepEqual(resolvedIdentityFailure, {
    allowed: false,
    reason: "authentication_failed"
  });

  console.log("authorizeAuthenticatedStaffAction.test.ts passed");
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
