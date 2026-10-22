import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import {
  requireAuthenticatedAdminStaffActorForFunction
} from "../../src/functions/_shared/authenticatedAdminStaffActor";
import {
  createGetStaffIdentityAuditHandler,
  getStaffIdentityAudit,
  type GetStaffIdentityAuditDependencies
} from "../../src/functions/getStaffIdentityAudit/index";

type TestResponse = {
  status: number;
  body: Record<string, any>;
};

const SETTINGS = [
  "HOPE_ADMIN_API_KEY",
  "HOPE_ADMIN_STAFF_IDS",
  "FEATURE_ENTRA_ADMIN_AUTHORIZATION",
  "HOPE_ENTRA_TENANT_ID",
  "HOPE_ENTRA_API_AUDIENCE",
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "HOPE_ENTRA_REQUIRED_SCOPES",
  "HOPE_ENTRA_REQUIRED_ROLES",
  "HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS"
] as const;

function request(headers: Record<string, string> = {}): any {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      value
    ])
  );

  return {
    headers: {
      ...normalized,
      get: (name: string) =>
        normalized[name.toLowerCase()] ?? null
    },
    params: { staffId: "synthetic-staff-id" }
  };
}

async function invoke(
  headers: Record<string, string> = {},
  dependencies?: GetStaffIdentityAuditDependencies
): Promise<TestResponse> {
  const context: any = {
    res: null,
    log: Object.assign(
      () => undefined,
      { error: () => undefined }
    )
  };

  const req = request(headers);
  if (dependencies) {
    await createGetStaffIdentityAuditHandler(dependencies)(context, req);
  } else {
    await getStaffIdentityAudit(context, req);
  }
  assert.ok(context.res, "Endpoint must return a response");
  return context.res as TestResponse;
}

function assertRejected(
  result: TestResponse,
  status: number,
  authRejected: boolean
): void {
  assert.equal(result.status, status);
  assert.equal(result.body.ok, false);
  const requestId = authRejected
    ? result.body.requestId
    : result.body.error?.requestId;
  assert.equal(typeof requestId, "string");
  if (!authRejected) {
    assert.equal(
      result.body.error?.code,
      "GET_STAFF_IDENTITY_AUDIT_FAILED"
    );
    assert.equal(result.body.authRejectedBy, undefined);
  }
  assert.equal(result.body.items, undefined);

  if (authRejected) {
    assert.equal(
      result.body.authRejectedBy,
      "getStaffIdentityAudit"
    );
  }
}

async function run(): Promise<void> {
  const previous: Record<string, string | undefined> = {};

  for (const name of SETTINGS) {
    previous[name] = process.env[name];
  }

  try {
    Object.assign(process.env, {
      HOPE_ADMIN_API_KEY: "synthetic-admin-key",
      HOPE_ADMIN_STAFF_IDS: "synthetic-admin-id",
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: "false",
      HOPE_ENTRA_TENANT_ID: "invalid-while-disabled",
      HOPE_ENTRA_API_AUDIENCE:
        "api://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      AUTH_MICROSOFT_ENTRA_ID_ID:
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
      HOPE_ENTRA_REQUIRED_ROLES: "",
      HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS:
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    });

    // Disabled mode must ignore inactive Entra configuration.
    assertRejected(await invoke(), 401, true);

    // Valid enabled configuration.
    process.env.FEATURE_ENTRA_ADMIN_AUTHORIZATION = "true";
    process.env.HOPE_ENTRA_TENANT_ID =
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    // Authentication must fail before any audit-data access.
    assertRejected(await invoke(), 401, true);

    assertRejected(
      await invoke({ "x-admin-api-key": "synthetic-admin-key" }),
      401,
      true
    );

    assertRejected(
      await invoke({
        "x-admin-api-key": "synthetic-admin-key",
        authorization: "Basic synthetic"
      }),
      401,
      true
    );

    assertRejected(
      await invoke({
        "x-admin-api-key": "incorrect-key",
        authorization: "Bearer invalid.jwt.token"
      }),
      401,
      true
    );

    // Real authorization helper, local signing key and synthetic Staff.
    // No real Staff repository or Azure service is accessed.
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "staff-audit-local-test";
    jwk.alg = "RS256";
    jwk.use = "sig";

    const signingKeys = createLocalJWKSet({ keys: [jwk] });
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const objectId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const adminId = "synthetic-admin-id";
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
      ver: "2.0",
      tid: tenantId,
      oid: objectId,
      scp: "staff.access",
      azp: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "staff-audit-local-test"
      })
      .setIssuer(
        `https://login.microsoftonline.com/${tenantId}/v2.0`
      )
      .setAudience(
        "api://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      )
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const staff: CanonicalStaffIdentity = {
      staffId: adminId,
      displayName: "Synthetic Administrator",
      roleLabel: "Staff",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastEventId: "synthetic-event-1",
      entraTenantId: tenantId,
      entraObjectId: objectId,
      email: "synthetic-admin@example.invalid",
      phone: null,
      ministryAreaId: null
    };

    const auditEntry = {
      eventId: "synthetic-event-1",
      type: "staff.deactivated" as const,
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: adminId,
      actorDisplayName: staff.displayName,
      changes: { entraBindingChanged: false }
    };

    let auditReads = 0;

    const isolatedDependencies: GetStaffIdentityAuditDependencies = {
      authorizeActor: (req, configuration) =>
        requireAuthenticatedAdminStaffActorForFunction(
          req,
          configuration,
          {
            resolveSigningKey: signingKeys,
            readStaffDirectory: async () => [staff],
            readCanonicalStaffIdentity: async staffId =>
              staffId === adminId ? staff : null,
            readLegacyStaffIdentity: async staffId =>
              staffId === adminId ? staff : null
          }
        ),
      readAudit: async staffId => {
        auditReads += 1;
        assert.equal(staffId, "synthetic-staff-id");
        return [auditEntry];
      }
    };

    // Legacy administrator access must work when Entra enforcement is OFF.
    process.env.FEATURE_ENTRA_ADMIN_AUTHORIZATION = "false";

    const legacyAccepted = await invoke(
      {
        "x-admin-api-key": "synthetic-admin-key",
        "x-hope-admin-actor-id": adminId,
        authorization: "not-an-entra-token"
      },
      isolatedDependencies
    );

    assert.equal(legacyAccepted.status, 200);
    assert.equal(legacyAccepted.body.ok, true);
    assert.equal(legacyAccepted.body.staffId, "synthetic-staff-id");
    assert.equal(legacyAccepted.body.count, 1);
    assert.deepEqual(legacyAccepted.body.items, [auditEntry]);
    assert.equal(auditReads, 1);

    process.env.FEATURE_ENTRA_ADMIN_AUTHORIZATION = "true";
    auditReads = 0;

    const authorizedHeaders = {
      "x-admin-api-key": "synthetic-admin-key",
      "x-hope-admin-actor-id": adminId,
      authorization: `Bearer ${token}`
    };

    const accepted = await invoke(
      authorizedHeaders,
      isolatedDependencies
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ok, true);
    assert.equal(accepted.body.staffId, "synthetic-staff-id");
    assert.equal(accepted.body.count, 1);
    assert.deepEqual(accepted.body.items, [auditEntry]);
    assert.equal(auditReads, 1);

    const invalidToken = await invoke(
      {
        ...authorizedHeaders,
        authorization: "Bearer malformed"
      },
      isolatedDependencies
    );
    assertRejected(invalidToken, 401, true);
    assert.equal(auditReads, 1);

    const mismatchedActor = await invoke(
      {
        ...authorizedHeaders,
        "x-hope-admin-actor-id": "wrong-staff-id"
      },
      isolatedDependencies
    );
    assertRejected(mismatchedActor, 403, true);
    assert.equal(
      auditReads,
      1,
      "Denied requests must never read audit history"
    );
    // Missing allowed-client configuration must fail closed.
    delete process.env.HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS;
    assertRejected(await invoke(), 500, false);

    // Malformed feature settings must also fail closed.
    process.env.FEATURE_ENTRA_ADMIN_AUTHORIZATION = "invalid";
    assertRejected(await invoke(), 500, false);

    console.log(
      "Staff Audit authenticated endpoint tests passed"
    );
  } finally {
    for (const name of SETTINGS) {
      const original = previous[name];
      if (original === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original;
      }
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
