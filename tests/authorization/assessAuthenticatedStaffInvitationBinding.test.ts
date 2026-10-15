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
  assessAuthenticatedStaffInvitationBinding
} from "../../src/services/authorization/assessAuthenticatedStaffInvitationBinding";

import type {
  EntraStaffTokenVerificationConfiguration
} from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_OBJECT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUDIENCE = "api://hope-activation-assessment-test";
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

function staff(
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

function invitation(): Record<string, unknown> {
  return {
    staffId: "synthetic-pending-staff",
    entraTenantId: TENANT,
    entraObjectId: OBJECT
  };
}

type Result = Awaited<
  ReturnType<typeof assessAuthenticatedStaffInvitationBinding>
>;

function assertNonauthorizing(result: Result): void {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.identityIndependentlyVerified, false);
  assert.equal(result.activationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

async function run(): Promise<void> {
  const { privateKey, publicKey } =
    await generateKeyPair("RS256");

  const jwk = await exportJWK(publicKey);
  jwk.kid = "synthetic-activation-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const keys = createLocalJWKSet({ keys: [jwk] });

  const resolveSigningKey: JWTVerifyGetKey =
    (header, payload) => keys(header, payload);

  const now = Math.floor(Date.now() / 1000);

  async function token(options: {
    audience?: string;
    issuer?: string;
    tenantId?: string;
    objectId?: string;
    scope?: string;
    expiresAt?: number;
  } = {}): Promise<string> {
    return new SignJWT({
      ver: "2.0",
      tid: options.tenantId ?? TENANT,
      oid: options.objectId ?? OBJECT,
      scp: options.scope ?? SCOPE
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "synthetic-activation-key"
      })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(options.expiresAt ?? now + 3600)
      .sign(privateKey);
  }

  const valid = await token();
  let directoryReads = 0;

  async function assess(
    accessToken: unknown,
    proposedInvitation: unknown = invitation(),
    directory: CanonicalStaffIdentity[] = [staff()]
  ): Promise<Result> {
    return assessAuthenticatedStaffInvitationBinding(
      accessToken,
      proposedInvitation,
      configuration(),
      {
        resolveSigningKey,
        readStaffDirectory: async () => {
          directoryReads += 1;
          return directory;
        }
      }
    );
  }

  // A correctly signed token plus a matching pending identity
  // produces review evidence, never activation authority.
  const matched = await assess(valid);

  assert.equal(matched.status, "binding_matched_for_review");
  assertNonauthorizing(matched);
  assert.equal(directoryReads, 1);
  assert.equal("staffId" in matched, false);
  assert.equal("accessToken" in matched, false);

  // GUID matching is case-insensitive.
  const normalized = await assess(
    valid,
    {
      staffId: "synthetic-pending-staff",
      entraTenantId: TENANT.toUpperCase(),
      entraObjectId: OBJECT.toUpperCase()
    },
    [
      staff({
        entraTenantId: TENANT.toUpperCase(),
        entraObjectId: OBJECT.toUpperCase()
      })
    ]
  );

  assert.equal(normalized.status, "binding_matched_for_review");
  assertNonauthorizing(normalized);

  // A valid principal cannot activate a different invitation.
  for (const changed of [
    { staffId: "different-staff" },
    { entraTenantId: OTHER_TENANT },
    { entraObjectId: OTHER_OBJECT }
  ]) {
    const result = await assess(valid, {
      ...invitation(),
      ...changed
    });

    assert.equal(result.status, "not_ready");
    assertNonauthorizing(result);
  }

  // Malformed invitation evidence is rejected even when
  // the principal token has been verified.
  for (const invalidInvitation of [
    null,
    {},
    [],
    { ...invitation(), extra: true },
    { ...invitation(), staffId: "" },
    { ...invitation(), entraTenantId: "invalid" }
  ]) {
    const result = await assess(valid, invalidInvitation);

    assert.equal(result.status, "input_rejected");
    assertNonauthorizing(result);
  }

  // No matching canonical identity, duplicate binding, and
  // non-pending status must all fail closed.
  for (const directory of [
    [],
    [staff({ entraObjectId: OTHER_OBJECT })],
    [
      staff(),
      staff({ staffId: "duplicate-pending" })
    ],
    [
      staff(),
      staff({
        staffId: "conflicting-active",
        status: "active"
      })
    ],
    [staff({ status: "active" })],
    [staff({ status: "inactive" })]
  ]) {
    const result = await assess(valid, invitation(), directory);

    assert.equal(result.status, "not_ready");
    assertNonauthorizing(result);
  }

  // Authentication failures must not read canonical storage.
  async function rejectBeforeRead(
    candidate: unknown
  ): Promise<void> {
    const readsBefore = directoryReads;
    const result = await assess(candidate);

    assert.equal(result.status, "not_ready");
    assertNonauthorizing(result);
    assert.equal(directoryReads, readsBefore);
  }

  const { privateKey: unrelatedKey } =
    await generateKeyPair("RS256");

  const invalidSignature = await new SignJWT({
    ver: "2.0",
    tid: TENANT,
    oid: OBJECT,
    scp: SCOPE
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "synthetic-activation-key"
    })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(unrelatedKey);

  await rejectBeforeRead(null);
  await rejectBeforeRead("");
  await rejectBeforeRead({});
  await rejectBeforeRead(invalidSignature);

  await rejectBeforeRead(await token({
    audience: "api://wrong-audience"
  }));

  await rejectBeforeRead(await token({
    issuer:
      `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0`
  }));

  await rejectBeforeRead(await token({
    tenantId: OTHER_TENANT
  }));

  // A valid signed token with a different object ID may
  // legitimately reach canonical directory resolution.
  // It must still fail closed without activation authority.
  const readsBeforeObjectMismatch = directoryReads;

  const objectMismatch = await assess(await token({
    objectId: OTHER_OBJECT
  }));

  assert.equal(objectMismatch.status, "not_ready");
  assertNonauthorizing(objectMismatch);
  assert.equal(
    directoryReads,
    readsBeforeObjectMismatch + 1
  );

  await rejectBeforeRead(await token({
    scope: "User.Read"
  }));

  await rejectBeforeRead(await token({
    expiresAt: now - 60
  }));

  // Storage faults produce generic, nonauthorizing outcomes.
  const unavailable = await assessAuthenticatedStaffInvitationBinding(
    valid,
    invitation(),
    configuration(),
    {
      resolveSigningKey,
      readStaffDirectory: async () => {
        throw new Error("synthetic_private_storage_error");
      }
    }
  );

  assert.equal(unavailable.status, "not_ready");
  assertNonauthorizing(unavailable);
  assert.ok(
    !JSON.stringify(unavailable).includes(
      "synthetic_private_storage_error"
    )
  );

  // Hostile invitation inputs cannot execute a getter or
  // introduce a successful activation result.
  {
    let getterCalled = false;
    const hostile = invitation();

    Object.defineProperty(hostile, "staffId", {
      get() {
        getterCalled = true;
        throw new Error("private_synthetic_getter");
      }
    });

    const result = await assess(valid, hostile);

    assert.equal(getterCalled, false);
    assert.equal(result.status, "input_rejected");
    assertNonauthorizing(result);
  }

  {
    const revoked = Proxy.revocable(invitation(), {});
    revoked.revoke();

    const result = await assess(valid, revoked.proxy);

    assert.equal(result.status, "input_rejected");
    assertNonauthorizing(result);
  }

  // Dependencies expose only a signing-key resolver and
  // a canonical-directory reader. No writer is supplied.
  assert.equal(matched.activationPermitted, false);
  assert.equal(matched.executionPermitted, false);
  assert.equal(matched.retryPermitted, false);

  console.log(
    "assessAuthenticatedStaffInvitationBinding.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});