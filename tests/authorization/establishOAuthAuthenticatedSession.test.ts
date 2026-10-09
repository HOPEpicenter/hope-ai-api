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
  establishOAuthAuthenticatedSession,
  type OAuthAuthenticatedSessionDependencies
} from "../../src/services/authorization/establishOAuthAuthenticatedSession";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BINDING_ID = "33333333-3333-4333-8333-333333333333";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const AUDIENCE = "api://hope-backend-test";
const SCOPE = "staff.access";

function staff(
  overrides: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: "canonical-staff-123",
    displayName: "Synthetic Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "event-test",
    entraTenantId: TENANT_ID,
    entraObjectId: OBJECT_ID,
    email: "test@example.invalid",
    phone: null,
    ministryAreaId: "area-test",
    ...overrides
  };
}

const denied = {
  established: false,
  reason: "authenticated_session_denied"
};

async function main(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "authenticated-boundary-test";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const localKeySet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey =
    (header, token) => localKeySet(header, token);

  const issuedAt = Math.floor(Date.now() / 1000);

  async function token(
    overrides: {
      objectId?: string;
      scope?: string;
      expiresAt?: number;
    } = {}
  ): Promise<string> {
    return new SignJWT({
      ver: "2.0",
      tid: TENANT_ID,
      oid: overrides.objectId ?? OBJECT_ID,
      scp: overrides.scope ?? SCOPE
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "authenticated-boundary-test"
      })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(overrides.expiresAt ?? issuedAt + 3600)
      .sign(privateKey);
  }

  const validToken = await token();

  let writes = 0;
  const records = new Map<string, unknown>();

  const makeDependencies = (
    readStaffDirectory: () => Promise<CanonicalStaffIdentity[]> =
      async () => [staff()]
  ): OAuthAuthenticatedSessionDependencies => ({
    verificationConfiguration: {
      tenantId: TENANT_ID,
      audience: AUDIENCE,
      requiredPermissions: {
        scopes: [SCOPE],
        roles: []
      }
    },
    identityDependencies: {
      resolveSigningKey,
      readStaffDirectory
    },
    establishmentDependencies: {
      generateSessionBindingId: () => BINDING_ID,
      async createIfAbsent(record) {
        writes += 1;
        if (records.has(record.sessionBindingId)) return false;
        records.set(record.sessionBindingId, { ...record });
        return true;
      }
    },
    nowMilliseconds: Date.parse("2026-01-01T12:00:00.000Z"),
    lifetimeMilliseconds: 15 * 60 * 1000
  });

  const dependencies = makeDependencies();

  const first = await establishOAuthAuthenticatedSession(
    validToken,
    dependencies
  );

  assert.equal(first.established, true);
  assert.equal(writes, 1);
  assert.equal(records.size, 1);

  if (!first.established) throw new Error("Expected synthetic session");

  assert.equal(first.record.canonicalStaffId, "canonical-staff-123");
  assert.equal(first.record.tenantId, TENANT_ID);
  assert.equal(first.record.entraObjectId, OBJECT_ID);
  assert.equal(first.record.sessionBindingId, BINDING_ID);

  // Repeated issuance with the same ID is denied by atomic storage.
  const replay = await establishOAuthAuthenticatedSession(
    validToken,
    dependencies
  );

  assert.deepEqual(replay, denied);
  assert.equal(records.size, 1);

  async function assertDeniedWithoutWrite(
    accessToken: string,
    deps: OAuthAuthenticatedSessionDependencies
  ): Promise<void> {
    const before = writes;

    assert.deepEqual(
      await establishOAuthAuthenticatedSession(accessToken, deps),
      denied
    );

    assert.equal(writes, before);
  }

  await assertDeniedWithoutWrite("", makeDependencies());
  await assertDeniedWithoutWrite("not-a-token", makeDependencies());

  await assertDeniedWithoutWrite(
    await token({ scope: "User.Read" }),
    makeDependencies()
  );

  await assertDeniedWithoutWrite(
    await token({ expiresAt: issuedAt - 60 }),
    makeDependencies()
  );

  await assertDeniedWithoutWrite(
    await token({ objectId: OTHER_ID }),
    makeDependencies()
  );

  await assertDeniedWithoutWrite(
    validToken,
    makeDependencies(async () => [])
  );

  await assertDeniedWithoutWrite(
    validToken,
    makeDependencies(async () => [
      staff({ status: "inactive" })
    ])
  );

  await assertDeniedWithoutWrite(
    validToken,
    makeDependencies(async () => [
      staff(),
      staff({ staffId: "another-staff" })
    ])
  );

  await assertDeniedWithoutWrite(
    validToken,
    makeDependencies(async () => {
      throw new Error("Synthetic staff directory unavailable");
    })
  );

  // The request cannot supply staff/tenant/object/binding IDs.
  // A mismatched canonical record is rejected before writing.
  await assertDeniedWithoutWrite(
    validToken,
    makeDependencies(async () => [
      staff({ entraTenantId: OTHER_ID })
    ])
  );

  await assertDeniedWithoutWrite(
    validToken,
    {
      ...makeDependencies(),
      lifetimeMilliseconds: 60 * 60 * 1000 + 1
    }
  );

  await assertDeniedWithoutWrite(
    validToken,
    {
      ...makeDependencies(),
      nowMilliseconds: Number.NaN
    }
  );

  const failedWrite = makeDependencies();

  failedWrite.establishmentDependencies = {
    generateSessionBindingId: () => OTHER_ID,
    async createIfAbsent() {
      throw new Error("Synthetic storage unavailable");
    }
  };

  assert.deepEqual(
    await establishOAuthAuthenticatedSession(validToken, failedWrite),
    denied
  );

  console.log(
    "establishOAuthAuthenticatedSession synthetic tests passed"
  );
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
