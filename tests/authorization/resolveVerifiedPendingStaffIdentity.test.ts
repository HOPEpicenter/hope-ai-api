import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  resolveVerifiedPendingStaffIdentity
} from "../../src/services/authorization/resolveVerifiedPendingStaffIdentity";
import type {
  EntraStaffTokenVerificationConfiguration
} from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_OBJECT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUDIENCE = "api://hope-pending-test";
const SCOPE = "staff.access";
const ISSUER =
  `https://login.microsoftonline.com/${TENANT}/v2.0`;

function configuration():
  EntraStaffTokenVerificationConfiguration {
  return {
    tenantId: TENANT,
    audience: AUDIENCE,
    requiredPermissions: {
      scopes: [SCOPE],
      roles: []
    }
  };
}

function identity(
  changes: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: "synthetic-pending-staff",
    displayName: "Synthetic Pending Staff",
    roleLabel: "Staff",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "synthetic-invitation",
    entraTenantId: TENANT,
    entraObjectId: OBJECT,
    email: null,
    phone: null,
    ministryAreaId: null,
    ...changes
  };
}

async function run(): Promise<void> {
  const { privateKey, publicKey } =
    await generateKeyPair("RS256");

  const jwk = await exportJWK(publicKey);
  jwk.kid = "pending-resolver-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const keySet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey =
    (header, token) => keySet(header, token);

  const now = Math.floor(Date.now() / 1000);

  async function token(overrides: {
    issuer?: string;
    audience?: string;
    tenantId?: string;
    objectId?: string;
    scope?: string;
    expiresAt?: number;
  } = {}): Promise<string> {
    return new SignJWT({
      ver: "2.0",
      tid: overrides.tenantId ?? TENANT,
      oid: overrides.objectId ?? OBJECT,
      scp: overrides.scope ?? SCOPE
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "pending-resolver-key"
      })
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(overrides.expiresAt ?? now + 3600)
      .sign(privateKey);
  }

  const validToken = await token();
  let reads = 0;

  const evidence = await resolveVerifiedPendingStaffIdentity(
    validToken,
    configuration(),
    {
      resolveSigningKey,
      readStaffDirectory: async () => {
        reads += 1;
        return [identity()];
      }
    }
  );

  assert.equal(reads, 1);
  assert.deepEqual(evidence, {
    staffId: "synthetic-pending-staff",
    tenantId: TENANT,
    objectId: OBJECT,
    canonicalStatus: "pending",
    advisoryOnly: true,
    authoritative: false,
    activationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    productionRolloutPermitted: false
  });

  assert.equal("roles" in evidence, false);
  assert.equal("email" in evidence, false);
  assert.equal("token" in evidence, false);

  // Matching must normalize Entra GUID case.
  const normalized = await resolveVerifiedPendingStaffIdentity(
    validToken,
    configuration(),
    {
      resolveSigningKey,
      readStaffDirectory: async () => [
        identity({
          entraTenantId: TENANT.toUpperCase(),
          entraObjectId: OBJECT.toUpperCase()
        })
      ]
    }
  );
  assert.equal(normalized.staffId, "synthetic-pending-staff");

  // One canonical identity is mandatory. No registry fallback.
  for (const directory of [
    [],
    [identity({ entraTenantId: OTHER_TENANT })],
    [identity({ entraObjectId: OTHER_OBJECT })],
    [
      identity(),
      identity({ staffId: "synthetic-duplicate-staff" })
    ],
    [
      identity(),
      identity({
        staffId: "synthetic-active-conflict",
        status: "active"
      })
    ]
  ]) {
    await assert.rejects(() =>
      resolveVerifiedPendingStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => directory
        }
      )
    );
  }

  // Active and inactive identities must not be resolved as pending.
  for (const status of ["active", "inactive"] as const) {
    await assert.rejects(
      () => resolveVerifiedPendingStaffIdentity(
        validToken,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => [
            identity({ status })
          ]
        }
      ),
      /not pending/
    );
  }

  // A bad token must fail before any canonical-directory read.
  let rejectedTokenReads = 0;

  async function rejectBeforeRead(
    candidate: string
  ): Promise<void> {
    await assert.rejects(() =>
      resolveVerifiedPendingStaffIdentity(
        candidate,
        configuration(),
        {
          resolveSigningKey,
          readStaffDirectory: async () => {
            rejectedTokenReads += 1;
            return [identity()];
          }
        }
      )
    );
  }

  const { privateKey: unrelatedPrivateKey } =
    await generateKeyPair("RS256");

  const wrongSignature = await new SignJWT({
    ver: "2.0",
    tid: TENANT,
    oid: OBJECT,
    scp: SCOPE
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "pending-resolver-key"
    })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(unrelatedPrivateKey);

  await rejectBeforeRead(wrongSignature);
  await rejectBeforeRead(await token({
    audience: "api://wrong-audience"
  }));
  await rejectBeforeRead(await token({
    issuer: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0`
  }));
  await rejectBeforeRead(await token({
    tenantId: OTHER_TENANT
  }));
  await rejectBeforeRead(await token({
    expiresAt: now - 60
  }));
  await rejectBeforeRead(await token({
    scope: "User.Read"
  }));

  assert.equal(rejectedTokenReads, 0);

  // Directory unavailability fails closed.
  await assert.rejects(
    () => resolveVerifiedPendingStaffIdentity(
      validToken,
      configuration(),
      {
        resolveSigningKey,
        readStaffDirectory: async () => {
          throw new Error("synthetic directory unavailable");
        }
      }
    ),
    /synthetic directory unavailable/
  );

  // Only an injected read function is provided. No writer exists.
  assert.equal(evidence.authoritative, false);
  assert.equal(evidence.activationPermitted, false);
  assert.equal(evidence.executionPermitted, false);

  console.log(
    "resolveVerifiedPendingStaffIdentity.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});