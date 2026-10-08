import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { STAFF_IDENTITY_REGISTRY } from "../../src/services/operators/operatorIdentity";
import {
  resolveVerifiedEntraStaffIdentity
} from "../../src/services/authorization/resolveVerifiedEntraStaffIdentity";
import type { EntraStaffTokenVerificationConfiguration } from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_OBJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const API_AUDIENCE = "api://hope-backend-test";
const API_SCOPE = "staff.access";
const ISSUER =
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

function configuration(
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
    staffId: "canonical-staff-123",
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
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "resolver-test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const localKeySet = createLocalJWKSet({
    keys: [publicJwk]
  });
  const resolveSigningKey: JWTVerifyGetKey = (header, token) =>
    localKeySet(header, token);
  const now = Math.floor(Date.now() / 1000);

  async function createToken(options: {
    expiresAt?: number;
    issuer?: string;
    audience?: string;
    tenantId?: string;
    objectId?: string;
    scope?: string;
    roles?: string[];
  } = {}): Promise<string> {
    const builder = new SignJWT({
      ver: "2.0",
      tid: options.tenantId ?? TENANT_ID,
      oid: options.objectId ?? OBJECT_ID,
      scp: options.scope ?? API_SCOPE,
      ...(options.roles ? { roles: options.roles } : {})
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "resolver-test-key"
      })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? API_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(options.expiresAt ?? now + 3600);

    return builder.sign(privateKey);
  }

  let directoryReads = 0;
  const readOneActiveStaff = async (): Promise<CanonicalStaffIdentity[]> => {
    directoryReads += 1;
    return [staffIdentity()];
  };
  const validToken = await createToken();
  const resolved = await resolveVerifiedEntraStaffIdentity(
    validToken,
    configuration(),
    {
      resolveSigningKey,
      readStaffDirectory: readOneActiveStaff
    }
  );

  assert.deepEqual(resolved, {
    staffId: "canonical-staff-123",
    tenantId: TENANT_ID,
    objectId: OBJECT_ID
  });
  assert.equal(directoryReads, 1);
  assert.equal("roleLabel" in resolved, false);
  assert.equal("roles" in resolved, false);

  assert.ok(
    STAFF_IDENTITY_REGISTRY.some(identity => identity.staffId === "ops-user-1")
  );
  await assert.rejects(
    () =>
      resolveVerifiedEntraStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => []
        }
      ),
    /No canonical staff identity matches/
  );

  for (const status of ["inactive", "pending"] as const) {
    await assert.rejects(
      () =>
        resolveVerifiedEntraStaffIdentity(
          validToken,
          configuration(),
          {
            resolveSigningKey,
            readStaffDirectory: async () => [
              staffIdentity({ status })
            ]
          }
        ),
      /not active/
    );
  }

  for (const matches of [
    [
      staffIdentity({ staffId: "active-one" }),
      staffIdentity({ staffId: "active-two" })
    ],
    [
      staffIdentity({ staffId: "active-one" }),
      staffIdentity({
        staffId: "inactive-two",
        status: "inactive"
      })
    ]
  ]) {
    await assert.rejects(
      () =>
        resolveVerifiedEntraStaffIdentity(
          validToken,
          configuration(),
          {
            resolveSigningKey,
            readStaffDirectory: async () => matches
          }
        ),
      /Multiple canonical staff identities match/
    );
  }

  await assert.rejects(
    () =>
      resolveVerifiedEntraStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => [
            staffIdentity({
              entraTenantId: OTHER_TENANT_ID
            })
          ]
        }
      ),
    /No canonical staff identity matches/
  );
  await assert.rejects(
    () =>
      resolveVerifiedEntraStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => [
            staffIdentity({
              entraObjectId: OTHER_OBJECT_ID
            })
          ]
        }
      ),
    /No canonical staff identity matches/
  );

  let invalidTokenDirectoryReads = 0;
  const assertVerificationFailsBeforeDirectoryRead = async (
    token: string,
    tokenConfiguration = configuration()
  ): Promise<void> => {
    await assert.rejects(() =>
      resolveVerifiedEntraStaffIdentity(token, tokenConfiguration, {
        resolveSigningKey,
        readStaffDirectory: async () => {
          invalidTokenDirectoryReads += 1;
          return [staffIdentity()];
        }
      })
    );
  };

  const { privateKey: otherPrivateKey } =
    await generateKeyPair("RS256");
  const invalidSignatureToken = await new SignJWT({
    ver: "2.0",
    tid: TENANT_ID,
    oid: OBJECT_ID,
    scp: API_SCOPE
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "resolver-test-key"
    })
    .setIssuer(ISSUER)
    .setAudience(API_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(otherPrivateKey);
  await assertVerificationFailsBeforeDirectoryRead(
    invalidSignatureToken
  );

  const expiredToken = await createToken({
    expiresAt: now - 60
  });
  await assertVerificationFailsBeforeDirectoryRead(expiredToken);

  const improperlyScopedToken = await createToken({
    scope: "User.Read"
  });
  await assertVerificationFailsBeforeDirectoryRead(
    improperlyScopedToken
  );
  assert.equal(invalidTokenDirectoryReads, 0);

  await assert.rejects(
    () =>
      resolveVerifiedEntraStaffIdentity(validToken, configuration(), {
        resolveSigningKey,
        readStaffDirectory: async () => {
          throw new Error("canonical directory unavailable");
        }
      }),
    /canonical directory unavailable/
  );

  await assert.rejects(
    () =>
      resolveVerifiedEntraStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => []
        }
      ),
    /No canonical staff identity matches/
  );

  const adminClaimToken = await createToken({
    roles: ["system.admin"]
  });
  const identityWithAdminClaim =
    await resolveVerifiedEntraStaffIdentity(
      adminClaimToken,
      configuration({
        requiredPermissions: {
          scopes: [API_SCOPE],
          roles: ["system.admin"]
        }
      }),
      {
        resolveSigningKey,
        readStaffDirectory: readOneActiveStaff
      }
    );
  assert.deepEqual(identityWithAdminClaim, {
    staffId: "canonical-staff-123",
    tenantId: TENANT_ID,
    objectId: OBJECT_ID
  });
  assert.equal("roleLabel" in identityWithAdminClaim, false);
  assert.equal("roles" in identityWithAdminClaim, false);

  console.log(
    "resolveVerifiedEntraStaffIdentity.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
