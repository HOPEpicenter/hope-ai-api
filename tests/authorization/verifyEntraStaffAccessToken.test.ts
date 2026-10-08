import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTVerifyGetKey
} from "jose";
import {
  createEntraTenantSigningKeyResolver,
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration
} from "../../src/services/authorization/verifyEntraStaffAccessToken";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TENANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CLIENT_APPLICATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_CLIENT_APPLICATION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const API_AUDIENCE = "api://hope-backend-test";
const API_SCOPE = "staff.access";
const API_ROLE = "staff.reader";
const ISSUER =
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const TOKEN_LIFETIME_SECONDS = 3600;

type TestSigningKeys = {
  privateKey: CryptoKey;
  publicJwk: JWK;
  resolver: JWTVerifyGetKey;
};

async function createSigningKeys(
  kid = "local-test-key"
): Promise<TestSigningKeys> {
  const { privateKey, publicKey } =
    await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const localKeySet = createLocalJWKSet({
    keys: [publicJwk]
  });

  return {
    privateKey,
    publicJwk,
    resolver: (protectedHeader, token) =>
      localKeySet(protectedHeader, token)
  };
}

function configuration(
  overrides: Partial<EntraStaffTokenVerificationConfiguration> = {}
): EntraStaffTokenVerificationConfiguration {
  return {
    tenantId: TENANT_ID,
    audience: API_AUDIENCE,
    requiredPermissions: {
      scopes: [API_SCOPE],
      roles: [API_ROLE]
    },
    ...overrides
  };
}

async function createToken(
  privateKey: CryptoKey,
  overrides: {
    header?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    issuer?: string;
    audience?: string | string[];
    issuedAt?: number;
    expiresAt?: number;
  } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    ver: "2.0",
    tid: TENANT_ID,
    oid: OBJECT_ID,
    scp: API_SCOPE,
    ...overrides.payload
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "local-test-key",
      ...overrides.header
    })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? API_AUDIENCE)
    .setIssuedAt(overrides.issuedAt ?? now)
    .setExpirationTime(
      overrides.expiresAt ?? now + TOKEN_LIFETIME_SECONDS
    );

  return builder.sign(privateKey);
}

async function run(): Promise<void> {
  const keys = await createSigningKeys();
  const now = Math.floor(Date.now() / 1000);
  const validToken = await createToken(keys.privateKey);
  const verified = await verifyEntraStaffAccessToken(
    validToken,
    configuration(),
    keys.resolver
  );

  assert.deepEqual(verified, {
    tenantId: TENANT_ID,
    objectId: OBJECT_ID,
    scopes: [API_SCOPE],
    roles: []
  });

  const roleOnlyToken = await createToken(keys.privateKey, {
    payload: { scp: undefined, roles: [API_ROLE] }
  });
  const roleOnlyVerified = await verifyEntraStaffAccessToken(
    roleOnlyToken,
    configuration(),
    keys.resolver
  );
  assert.deepEqual(roleOnlyVerified, {
    tenantId: TENANT_ID,
    objectId: OBJECT_ID,
    scopes: [],
    roles: [API_ROLE]
  });

  const clientRestrictedConfiguration = configuration({
    allowedClientApplicationIds: [CLIENT_APPLICATION_ID]
  });
  for (const payload of [
    { azp: CLIENT_APPLICATION_ID },
    { azp: CLIENT_APPLICATION_ID, scp: undefined, roles: [API_ROLE] }
  ]) {
    const allowedClientToken = await createToken(keys.privateKey, {
      payload
    });
    await verifyEntraStaffAccessToken(
      allowedClientToken,
      clientRestrictedConfiguration,
      keys.resolver
    );
  }

  for (const azp of [
    OTHER_CLIENT_APPLICATION_ID,
    "not-a-guid",
    undefined
  ]) {
    for (const tokenPermissions of [
      {},
      { scp: undefined, roles: [API_ROLE] }
    ]) {
      const unauthorizedClientToken = await createToken(
        keys.privateKey,
        {
          payload: { azp, ...tokenPermissions }
        }
      );
      await assert.rejects(
        () =>
          verifyEntraStaffAccessToken(
            unauthorizedClientToken,
            clientRestrictedConfiguration,
            keys.resolver
          ),
        /client application is not authorized/
      );
    }
  }

  for (const allowedClientApplicationIds of [
    [],
    ["not-a-guid"]
  ]) {
    await assert.rejects(
      () =>
        verifyEntraStaffAccessToken(validToken, {
          ...configuration(),
          allowedClientApplicationIds
        }),
      /must be a nonempty list of GUIDs/
    );
  }

  const wrongKey = await createSigningKeys();
  const invalidSignatureToken =
    await createToken(wrongKey.privateKey);
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      invalidSignatureToken,
      configuration(),
      keys.resolver
    )
  );

  const expiredToken = await createToken(keys.privateKey, {
    issuedAt: now - 3600,
    expiresAt: now - 1800
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      expiredToken,
      configuration(),
      keys.resolver
    )
  );

  const notYetValidToken = await createToken(keys.privateKey, {
    payload: { nbf: now + 3600 }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      notYetValidToken,
      configuration(),
      keys.resolver
    )
  );

  const wrongIssuerToken = await createToken(keys.privateKey, {
    issuer: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0`
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      wrongIssuerToken,
      configuration(),
      keys.resolver
    )
  );

  const wrongAudienceToken = await createToken(keys.privateKey, {
    audience: "api://another-resource"
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      wrongAudienceToken,
      configuration(),
      keys.resolver
    )
  );

  const multipleAudienceToken = await createToken(keys.privateKey, {
    audience: [API_AUDIENCE, "00000003-0000-0000-c000-000000000000"]
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      multipleAudienceToken,
      configuration(),
      keys.resolver
    )
  );

  const wrongTenantToken = await createToken(keys.privateKey, {
    payload: { tid: OTHER_TENANT_ID }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      wrongTenantToken,
      configuration(),
      keys.resolver
    )
  );

  const missingObjectIdToken = await createToken(keys.privateKey, {
    payload: { oid: undefined }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      missingObjectIdToken,
      configuration(),
      keys.resolver
    )
  );

  const invalidObjectIdToken = await createToken(keys.privateKey, {
    payload: { oid: "not-a-guid" }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      invalidObjectIdToken,
      configuration(),
      keys.resolver
    )
  );

  const unsupportedAlgorithmKeys =
    await generateKeyPair("RS512");
  const unsupportedAlgorithmToken = await createToken(
    unsupportedAlgorithmKeys.privateKey,
    { header: { alg: "RS512" } }
  );
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      unsupportedAlgorithmToken,
      configuration(),
      keys.resolver
    )
  );

  const unknownKey = await createSigningKeys("different-key-id");
  const unknownSigningKeyToken =
    await createToken(unknownKey.privateKey);
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      unknownSigningKeyToken,
      configuration(),
      keys.resolver
    )
  );

  await assert.rejects(
    () =>
      verifyEntraStaffAccessToken(validToken, {
        ...configuration(),
        tenantId: ""
      }),
    /tenant ID must be configured/
  );
  await assert.rejects(
    () =>
      verifyEntraStaffAccessToken(validToken, {
        ...configuration(),
        audience: ""
      }),
    /audience must be configured/
  );
  await assert.rejects(
    () =>
      verifyEntraStaffAccessToken(validToken, {
        ...configuration(),
        requiredPermissions: {}
      }),
    /scope or app role must be configured/
  );

  let discoveryAttempts = 0;
  const discoveryFailure = createEntraTenantSigningKeyResolver(
    TENANT_ID,
    async () => {
      discoveryAttempts += 1;
      return new Response("", { status: 503 });
    }
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() =>
      verifyEntraStaffAccessToken(
        validToken,
        configuration(),
        discoveryFailure
      )
    );
  }
  assert.equal(discoveryAttempts, 2);

  const untrustedDiscovery = createEntraTenantSigningKeyResolver(
    TENANT_ID,
    async input => {
      assert.equal(
        input,
        `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration`
      );
      return Response.json({
        issuer: ISSUER,
        jwks_uri: "https://attacker.example/keys"
      });
    }
  );
  await assert.rejects(
    () =>
      verifyEntraStaffAccessToken(
        validToken,
        configuration(),
        untrustedDiscovery
      ),
    /discovery metadata did not match/
  );

  const makeDiscoveryResponse = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    assert.equal(
      String(input),
      `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/openid-configuration`
    );
    assert.equal(init?.redirect, "error");
    return Response.json({
      issuer: ISSUER,
      jwks_uri:
        `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`
    });
  };
  let recoveryAttempts = 0;
  const recoveringResolver = createEntraTenantSigningKeyResolver(
    TENANT_ID,
    makeDiscoveryResponse,
    async (url, options) => {
      assert.equal(
        url,
        `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`
      );
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      recoveryAttempts += 1;

      if (recoveryAttempts === 1) {
        return new Response("", { status: 503 });
      }

      return Response.json({ keys: [keys.publicJwk] });
    }
  );
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      validToken,
      configuration(),
      recoveringResolver
    )
  );
  await verifyEntraStaffAccessToken(
    validToken,
    configuration(),
    recoveringResolver
  );
  assert.equal(recoveryAttempts, 2);

  const rotatedKeys = await createSigningKeys("rotated-test-key");
  const oldAndRotatedJwks = {
    keys: [keys.publicJwk, rotatedKeys.publicJwk]
  };
  let rotationFetches = 0;
  const rotatingResolver = createEntraTenantSigningKeyResolver(
    TENANT_ID,
    makeDiscoveryResponse,
    async () => {
      rotationFetches += 1;
      return Response.json(
        rotationFetches === 1
          ? { keys: [keys.publicJwk] }
          : oldAndRotatedJwks
      );
    }
  );
  await verifyEntraStaffAccessToken(
    validToken,
    configuration(),
    rotatingResolver
  );
  const rotatedToken = await createToken(rotatedKeys.privateKey, {
    header: { kid: "rotated-test-key" }
  });
  const realDateNow = Date.now;
  try {
    Date.now = () => realDateNow() + 31_000;
    await verifyEntraStaffAccessToken(
      rotatedToken,
      configuration(),
      rotatingResolver
    );
  } finally {
    Date.now = realDateNow;
  }
  assert.equal(rotationFetches, 2);

  let outageFetches = 0;
  const recoveringOutageResolver =
    createEntraTenantSigningKeyResolver(
      TENANT_ID,
      makeDiscoveryResponse,
      async () => {
        outageFetches += 1;

        if (outageFetches === 2) {
          return new Response("", { status: 503 });
        }

        return Response.json({ keys: [keys.publicJwk] });
      }
    );
  await verifyEntraStaffAccessToken(
    validToken,
    configuration(),
    recoveringOutageResolver
  );
  const outageDateNow = Date.now;
  try {
    Date.now = () => outageDateNow() + 10 * 60 * 1000 + 1;
    await assert.rejects(() =>
      verifyEntraStaffAccessToken(
        validToken,
        configuration(),
        recoveringOutageResolver
      )
    );
    await verifyEntraStaffAccessToken(
      validToken,
      configuration(),
      recoveringOutageResolver
    );
  } finally {
    Date.now = outageDateNow;
  }
  assert.equal(outageFetches, 3);

  const noPermissionToken = await createToken(keys.privateKey, {
    payload: { scp: "User.Read", roles: ["other.role"] }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      noPermissionToken,
      configuration(),
      keys.resolver
    ),
    /lacks a configured API scope or app role/
  );

  const graphToken = await createToken(keys.privateKey, {
    audience: "00000003-0000-0000-c000-000000000000",
    payload: {
      scp: "User.Read"
    }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      graphToken,
      configuration(),
      keys.resolver
    )
  );

  const idToken = await createToken(keys.privateKey, {
    audience: "hope-client-test",
    payload: {
      nonce: "local-test-nonce",
      scp: undefined,
      roles: undefined
    }
  });
  await assert.rejects(() =>
    verifyEntraStaffAccessToken(
      idToken,
      configuration(),
      keys.resolver
    )
  );

  const idTokenWithApiAudience = await createToken(
    keys.privateKey,
    {
      payload: {
        nonce: "local-test-nonce",
        scp: undefined,
        roles: [API_ROLE]
      }
    }
  );
  await assert.rejects(
    () =>
      verifyEntraStaffAccessToken(
        idTokenWithApiAudience,
        configuration(),
        keys.resolver
      ),
    /ID tokens cannot be used/
  );

  console.log(
    "verifyEntraStaffAccessToken.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
