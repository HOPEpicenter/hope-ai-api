import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey
} from "jose";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { resolveTrustedMinistryAuthorizationContext } from "../../src/services/authorization/resolveTrustedMinistryAuthorizationContext";
import type { EntraStaffTokenVerificationConfiguration } from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_OBJECT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUDIENCE = "api://hope-context-test";
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

function configuration(): EntraStaffTokenVerificationConfiguration {
  return {
    tenantId: TENANT,
    audience: AUDIENCE,
    requiredPermissions: {
      scopes: ["staff.access"],
      roles: []
    }
  };
}

function staff(
  changes: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: "synthetic-staff-1",
    displayName: "Synthetic Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "synthetic-event-1",
    entraTenantId: TENANT,
    entraObjectId: OBJECT,
    email: "synthetic@example.invalid",
    phone: null,
    ministryAreaId: "synthetic-area-1",
    ...changes
  };
}

async function run(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "context-test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const keySet = createLocalJWKSet({ keys: [jwk] });
  const resolveSigningKey: JWTVerifyGetKey =
    (header, token) => keySet(header, token);

  const now = Math.floor(Date.now() / 1000);

  async function token(options: {
    objectId?: string;
    audience?: string;
    expiresAt?: number;
    roles?: string[];
  } = {}): Promise<string> {
    return new SignJWT({
      ver: "2.0",
      tid: TENANT,
      oid: options.objectId ?? OBJECT,
      scp: "staff.access",
      ...(options.roles ? { roles: options.roles } : {})
    })
      .setProtectedHeader({ alg: "RS256", kid: "context-test-key" })
      .setIssuer(ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(options.expiresAt ?? now + 3600)
      .sign(privateKey);
  }

  const valid = await token();

  async function resolve(
    accessToken: string,
    records: CanonicalStaffIdentity[]
  ) {
    let reads = 0;
    const result = await resolveTrustedMinistryAuthorizationContext(
      accessToken,
      configuration(),
      {
        resolveSigningKey,
        readStaffDirectory: async () => {
          reads++;
          return records;
        }
      }
    );
    return { result, reads };
  }

  for (const [label, expectedRole] of [
    ["Pastor", "pastor"],
    ["Ministry Leader", "ministry_leader"],
    ["Staff", "staff"]
  ] as const) {
    const { result, reads } = await resolve(
      valid,
      [staff({ roleLabel: label })]
    );

    assert.deepEqual(result, {
      verifiedStaffId: "synthetic-staff-1",
      role: expectedRole,
      active: true,
      ledMinistryAreaIds: [],
      assignedVisitorIds: []
    });
    assert.equal(reads, 1, `${label}: exactly one directory read`);
  }

  for (const label of [
    "Administrator",
    "system_administrator",
    "Youth Leader",
    "",
    "Pastor, Administrator"
  ]) {
    await assert.rejects(
      () => resolve(valid, [staff({ roleLabel: label })]),
      /not authorized/,
      `Unsupported role: ${label}`
    );
  }

  for (const staffId of [
    "",
    " ",
    " synthetic-staff-1",
    "synthetic-staff-1 "
  ]) {
    await assert.rejects(
      () => resolve(valid, [staff({ staffId })]),
      /exactly one canonical staff identity/,
      `Malformed canonical staff ID: ${JSON.stringify(staffId)}`
    );
  }
  for (const status of ["inactive", "pending"] as const) {
    await assert.rejects(
      () => resolve(valid, [staff({ status })]),
      /not active/,
      `Inactive status: ${status}`
    );
  }

  await assert.rejects(
    () => resolve(valid, []),
    /exactly one canonical staff identity/
  );

  await assert.rejects(
    () => resolve(valid, [
      staff({ staffId: "synthetic-one" }),
      staff({ staffId: "synthetic-two" })
    ]),
    /exactly one canonical staff identity/
  );

  await assert.rejects(
    () => resolve(valid, [
      staff(),
      staff({ entraObjectId: OTHER_OBJECT })
        ]),
    /Canonical staff ID is not unique/
  );

  const adminClaim = await token({
    roles: ["Global Administrator", "Pastor"]
  });

  const adminResult = await resolve(
    adminClaim,
    [staff({ roleLabel: "Staff" })]
  );

  assert.equal(adminResult.result.role, "staff");
  assert.deepEqual(adminResult.result.assignedVisitorIds, []);
  assert.deepEqual(adminResult.result.ledMinistryAreaIds, []);

  let invalidTokenDirectoryReads = 0;

  for (const invalid of [
    "not-a-token",
    await token({ audience: "api://wrong-audience" }),
    await token({ expiresAt: now - 60 })
  ]) {
    await assert.rejects(
      () =>
        resolveTrustedMinistryAuthorizationContext(
          invalid,
          configuration(),
          {
            resolveSigningKey,
            readStaffDirectory: async () => {
              invalidTokenDirectoryReads++;
              return [staff()];
            }
          }
        )
    );
  }

  assert.equal(
    invalidTokenDirectoryReads,
    0,
    "Rejected tokens must never trigger directory access"
  );

  console.log("resolveTrustedMinistryAuthorizationContext.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
