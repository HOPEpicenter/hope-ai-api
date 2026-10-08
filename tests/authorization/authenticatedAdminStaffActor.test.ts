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
  requireAdminStaffActorForFunction
} from "../../src/functions/_shared/adminStaffActor";
import {
  requireAuthenticatedAdminStaffActorForFunction
} from "../../src/functions/_shared/authenticatedAdminStaffActor";
import type { EntraStaffTokenVerificationConfiguration } from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const API_AUDIENCE = "api://hope-backend-test";
const API_SCOPE = "staff.access";
const ADMIN_STAFF_ID = "canonical-admin-123";
const OTHER_STAFF_ID = "canonical-staff-456";
const ADMIN_API_KEY = "local-test-admin-api-key";
const ISSUER =
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

type TestRequest = {
  headers: Record<string, string | string[]>;
  rawHeaders?: string[];
};

function request(
  headers: Record<string, string | string[]> = {},
  rawHeaders?: string[]
): TestRequest {
  return { headers, rawHeaders };
}

function staffIdentity(
  overrides: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: ADMIN_STAFF_ID,
    displayName: "Local Test Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "event-local",
    entraTenantId: TENANT_ID,
    entraObjectId: OBJECT_ID,
    email: "local-test@example.invalid",
    phone: null,
    ministryAreaId: null,
    ...overrides
  };
}

async function run(): Promise<void> {
  const previousApiKey = process.env.HOPE_ADMIN_API_KEY;
  const previousAdminIds = process.env.HOPE_ADMIN_STAFF_IDS;

  try {
    process.env.HOPE_ADMIN_API_KEY = ADMIN_API_KEY;
    process.env.HOPE_ADMIN_STAFF_IDS = ADMIN_STAFF_ID;

    const legacyRequest = request({
      "x-admin-api-key": ADMIN_API_KEY,
      "x-hope-admin-actor-id": ADMIN_STAFF_ID,
      authorization: "not even a bearer token"
    }, [
      "Authorization",
      "Bearer duplicated.raw.header",
      "authorization",
      "Bearer second.raw.header"
    ]);
    const legacyReader = async (staffId: string) =>
      staffId === ADMIN_STAFF_ID
        ? staffIdentity()
        : null;
    const expectedLegacy = await requireAdminStaffActorForFunction(
      legacyRequest,
      legacyReader
    );
    const disabledResult =
      await requireAuthenticatedAdminStaffActorForFunction(
        legacyRequest,
        { enforcementEnabled: false },
        { readLegacyStaffIdentity: legacyReader }
      );
    assert.deepEqual(disabledResult, expectedLegacy);

    const defaultOffResult =
      await requireAuthenticatedAdminStaffActorForFunction(
        legacyRequest,
        {},
        { readLegacyStaffIdentity: legacyReader }
      );
    assert.deepEqual(defaultOffResult, expectedLegacy);

    const missingLegacyActor = await requireAuthenticatedAdminStaffActorForFunction(
      request({ "x-admin-api-key": ADMIN_API_KEY }),
      { enforcementEnabled: false },
      { readLegacyStaffIdentity: legacyReader }
    );
    assert.deepEqual(
      missingLegacyActor,
      await requireAdminStaffActorForFunction(
        request({ "x-admin-api-key": ADMIN_API_KEY }),
        legacyReader
      )
    );

    const { privateKey, publicKey } =
      await generateKeyPair("RS256");
    const { privateKey: wrongPrivateKey } =
      await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "http-adapter-test-key";
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
      expiration?: number;
      audience?: string;
      issuer?: string;
      tenantId?: string;
      scope?: string;
      roles?: string[];
    } = {}): Promise<string> {
      return new SignJWT({
        ver: "2.0",
        tid: options.tenantId ?? TENANT_ID,
        oid: OBJECT_ID,
        scp: options.scope ?? API_SCOPE,
        ...(options.roles ? { roles: options.roles } : {})
      })
        .setProtectedHeader({
          alg: "RS256",
          kid: "http-adapter-test-key"
        })
        .setIssuer(options.issuer ?? ISSUER)
        .setAudience(options.audience ?? API_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(options.expiration ?? now + 3600)
        .sign(options.signingKey ?? privateKey);
    }

    const verificationConfiguration: EntraStaffTokenVerificationConfiguration = {
      tenantId: TENANT_ID,
      audience: API_AUDIENCE,
      requiredPermissions: {
        scopes: [API_SCOPE],
        roles: []
      }
    };
    const enabledConfiguration = {
      enforcementEnabled: true,
      verificationConfiguration,
      administratorStaffIds: [ADMIN_STAFF_ID]
    };
    let identityResolutionReads = 0;
    let canonicalIdentityReads = 0;
    const dependencies = {
      resolveSigningKey,
      readStaffDirectory: async (): Promise<CanonicalStaffIdentity[]> => {
        identityResolutionReads += 1;
        return [staffIdentity()];
      },
      readCanonicalStaffIdentity: async (
        staffId: string
      ): Promise<CanonicalStaffIdentity | null> => {
        canonicalIdentityReads += 1;
        return staffId === ADMIN_STAFF_ID
          ? staffIdentity()
          : null;
      }
    };
    const validToken = await createToken();
    const validRequest = (token: string, extraHeaders = {}) =>
      request({
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: `Bearer ${token}`,
        ...extraHeaders
      });

    const accepted = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      enabledConfiguration,
      dependencies
    );
    assert.deepEqual(accepted, {
      ok: true,
      actorId: ADMIN_STAFF_ID
    });

    const missingApiKey = await requireAuthenticatedAdminStaffActorForFunction(
      request({ authorization: `Bearer ${validToken}` }),
      enabledConfiguration,
      dependencies
    );
    assert.equal(missingApiKey.ok, false);
    if (!missingApiKey.ok) {
      assert.equal(missingApiKey.status, 401);
      assert.deepEqual(missingApiKey.body, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const readsBeforeInvalidKey = identityResolutionReads;
    const invalidApiKey = await requireAuthenticatedAdminStaffActorForFunction(
      request({
        "x-admin-api-key": "wrong",
        authorization: `Bearer ${validToken}`
      }),
      enabledConfiguration,
      dependencies
    );
    assert.equal(invalidApiKey.ok, false);
    assert.equal(identityResolutionReads, readsBeforeInvalidKey);

    for (const authorizationValue of [
      undefined,
      "Bearer",
      "Basic opaque",
      "Bearer not.a.jwt.extra",
      `Bearer ${validToken}, Bearer ${validToken}`
    ]) {
      const headers: Record<string, string> = {
        "x-admin-api-key": ADMIN_API_KEY
      };
      if (authorizationValue !== undefined) {
        headers.authorization = authorizationValue;
      }
      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        request(headers),
        enabledConfiguration,
        dependencies
      );
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.equal(denied.status, 401);
        assert.deepEqual(denied.body, {
          ok: false,
          error: "Unauthorized"
        });
      }
    }

    const duplicateAuthorizationHeaders =
      await requireAuthenticatedAdminStaffActorForFunction(
        request(
          {
            "x-admin-api-key": ADMIN_API_KEY,
            authorization: `Bearer ${validToken}`
          },
          [
            "x-admin-api-key",
            ADMIN_API_KEY,
            "Authorization",
            `Bearer ${validToken}`,
            "authorization",
            `Bearer ${validToken}`
          ]
        ),
        enabledConfiguration,
        dependencies
      );
    assert.equal(duplicateAuthorizationHeaders.ok, false);

    const duplicateActorHeaders =
      await requireAuthenticatedAdminStaffActorForFunction(
        request(
          {
            "x-admin-api-key": ADMIN_API_KEY,
            authorization: `Bearer ${validToken}`,
            "x-hope-admin-actor-id": ADMIN_STAFF_ID
          },
          [
            "x-admin-api-key",
            ADMIN_API_KEY,
            "authorization",
            `Bearer ${validToken}`,
            "x-hope-admin-actor-id",
            ADMIN_STAFF_ID,
            "X-HOPE-ADMIN-ACTOR-ID",
            ADMIN_STAFF_ID
          ]
        ),
        enabledConfiguration,
        dependencies
      );
    assert.equal(duplicateActorHeaders.ok, false);

    for (const conflicting of [
      {
        rawValue: `Bearer ${validToken}`,
        normalizedValue: "Bearer conflicting.token.value",
        headerName: "authorization"
      },
      {
        rawValue: ADMIN_STAFF_ID,
        normalizedValue: OTHER_STAFF_ID,
        headerName: "x-hope-admin-actor-id"
      }
    ]) {
      const headers: Record<string, string> = {
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: `Bearer ${validToken}`
      };
      if (conflicting.headerName === "authorization") {
        headers.authorization = conflicting.normalizedValue;
      } else {
        headers["x-hope-admin-actor-id"] =
          conflicting.normalizedValue;
      }

      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        request(headers, [
          "x-admin-api-key",
          ADMIN_API_KEY,
          conflicting.headerName,
          conflicting.rawValue
        ]),
        enabledConfiguration,
        dependencies
      );
      assert.equal(denied.ok, false);
    }

    const duplicateObjectHeaders: Array<
      Record<string, string | string[]>
    > = [
      {
        "x-admin-api-key": ADMIN_API_KEY,
        Authorization: `Bearer ${validToken}`,
        authorization: `Bearer ${validToken}`
      },
      {
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: `Bearer ${validToken}`,
        "x-hope-admin-actor-id": ADMIN_STAFF_ID,
        "X-HOPE-ADMIN-ACTOR-ID": ADMIN_STAFF_ID
      }
    ];
    for (const headers of duplicateObjectHeaders) {
      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        request(headers),
        enabledConfiguration,
        dependencies
      );
      assert.equal(denied.ok, false);
    }

    const arrayValuedHeaders: Array<
      Record<string, string | string[]>
    > = [
      {
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: [
          `Bearer ${validToken}`,
          `Bearer ${validToken}`
        ]
      },
      {
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: `Bearer ${validToken}`,
        "x-hope-admin-actor-id": [
          ADMIN_STAFF_ID,
          ADMIN_STAFF_ID
        ]
      }
    ];
    for (const headers of arrayValuedHeaders) {
      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        request(headers),
        enabledConfiguration,
        dependencies
      );
      assert.equal(denied.ok, false);
    }

    const wrongSignature = await createToken({
      signingKey: wrongPrivateKey
    });
    const expired = await createToken({
      expiration: now - 30
    });
    const wrongAudience = await createToken({
      audience: "api://wrong-audience"
    });
    const wrongTenant = await createToken({
      tenantId: OTHER_TENANT_ID,
      issuer: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0`
    });
    const insufficientPermission = await createToken({
      scope: "User.Read"
    });
    for (const token of [
      wrongSignature,
      expired,
      wrongAudience,
      wrongTenant,
      insufficientPermission
    ]) {
      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        validRequest(token),
        enabledConfiguration,
        dependencies
      );
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.deepEqual(denied.body, {
          ok: false,
          error: "Unauthorized"
        });
      }
    }

    const ordinaryStaff = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      {
        ...enabledConfiguration,
        administratorStaffIds: [OTHER_STAFF_ID]
      },
      dependencies
    );
    assert.equal(ordinaryStaff.ok, false);

    const matchingClaim = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken, {
        "x-hope-admin-actor-id": ADMIN_STAFF_ID
      }),
      enabledConfiguration,
      dependencies
    );
    assert.deepEqual(matchingClaim, {
      ok: true,
      actorId: ADMIN_STAFF_ID
    });

    const mismatchedClaim = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken, {
        "x-hope-admin-actor-id": OTHER_STAFF_ID
      }),
      enabledConfiguration,
      dependencies
    );
    assert.equal(mismatchedClaim.ok, false);

    const noClaim = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      enabledConfiguration,
      dependencies
    );
    assert.deepEqual(noClaim, {
      ok: true,
      actorId: ADMIN_STAFF_ID
    });

    const fetchStyleRequest = new Request("https://local.example/admin", {
      headers: {
        "x-admin-api-key": ADMIN_API_KEY,
        authorization: `Bearer ${validToken}`
      }
    });
    const fetchStyleAccepted =
      await requireAuthenticatedAdminStaffActorForFunction(
        fetchStyleRequest,
        enabledConfiguration,
        dependencies
      );
    assert.deepEqual(fetchStyleAccepted, {
      ok: true,
      actorId: ADMIN_STAFF_ID
    });

    const expressStyleHeaders = {
      "x-admin-api-key": ADMIN_API_KEY,
      authorization: `Bearer ${validToken}`
    };
    const expressStyleRequest = {
      headers: expressStyleHeaders,
      get: (name: string) =>
        expressStyleHeaders[
          name.toLowerCase() as keyof typeof expressStyleHeaders
        ]
    };
    const expressStyleAccepted =
      await requireAuthenticatedAdminStaffActorForFunction(
        expressStyleRequest,
        enabledConfiguration,
        dependencies
      );
    assert.deepEqual(expressStyleAccepted, {
      ok: true,
      actorId: ADMIN_STAFF_ID
    });

    const duplicateBindings = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      enabledConfiguration,
      {
        ...dependencies,
        readStaffDirectory: async () => [
          staffIdentity(),
          staffIdentity({
            staffId: "duplicate-admin",
            status: "inactive"
          })
        ]
      }
    );
    assert.equal(duplicateBindings.ok, false);

    const inactiveStaff = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      enabledConfiguration,
      {
        ...dependencies,
        readStaffDirectory: async () => [
          staffIdentity({ status: "inactive" })
        ]
      }
    );
    assert.equal(inactiveStaff.ok, false);

    for (const configuration of [
      { enforcementEnabled: true },
      {
        enforcementEnabled: true,
        verificationConfiguration: {
          ...verificationConfiguration,
          tenantId: ""
        },
        administratorStaffIds: [ADMIN_STAFF_ID]
      },
      {
        enforcementEnabled: true,
        verificationConfiguration,
        administratorStaffIds: []
      }
    ]) {
      const denied = await requireAuthenticatedAdminStaffActorForFunction(
        validRequest(validToken),
        configuration,
        dependencies
      );
      assert.equal(denied.ok, false);
      if (!denied.ok) {
        assert.deepEqual(denied.body, {
          ok: false,
          error: "Unauthorized"
        });
      }
    }

    const failedDirectory = await requireAuthenticatedAdminStaffActorForFunction(
      validRequest(validToken),
      enabledConfiguration,
      {
        ...dependencies,
        readStaffDirectory: async () => {
          throw new Error("private directory failure");
        }
      }
    );
    assert.equal(failedDirectory.ok, false);
    if (!failedDirectory.ok) {
      assert.deepEqual(failedDirectory.body, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const failedCanonicalRead =
      await requireAuthenticatedAdminStaffActorForFunction(
        validRequest(validToken),
        enabledConfiguration,
        {
          ...dependencies,
          readCanonicalStaffIdentity: async () => {
            throw new Error("private canonical lookup failure");
          }
        }
      );
    assert.equal(failedCanonicalRead.ok, false);

    assert.ok(canonicalIdentityReads > 0);

    console.log("authenticatedAdminStaffActor.test.ts passed");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.HOPE_ADMIN_API_KEY;
    } else {
      process.env.HOPE_ADMIN_API_KEY = previousApiKey;
    }

    if (previousAdminIds === undefined) {
      delete process.env.HOPE_ADMIN_STAFF_IDS;
    } else {
      process.env.HOPE_ADMIN_STAFF_IDS = previousAdminIds;
    }
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
