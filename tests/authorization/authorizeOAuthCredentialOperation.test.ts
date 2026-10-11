import assert from "node:assert/strict";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";

import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";

import {
  authorizeOAuthCredentialOperation,
  type OAuthCredentialOperationDependencies,
  type OAuthCredentialOperationRequest
} from "../../src/services/authorization/authorizeOAuthCredentialOperation";

import {
  generateOAuthSessionPossessionSecret,
  deriveOAuthSessionPossessionDigest
} from "../../src/services/authorization/verifyOAuthSessionPossession";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CREDENTIAL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CHALLENGE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const STAFF = "canonical-staff-123";
const NOW = Date.parse("2026-01-01T12:05:00.000Z");
const CREATED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:15:00.000Z";
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const AUDIENCE = "api://hope-backend-test";
const SCOPE = "staff.access";

const denied = {
  authorized: false,
  reason: "oauth_operation_denied"
};

function staff(
  overrides: Partial<CanonicalStaffIdentity> = {}
): CanonicalStaffIdentity {
  return {
    staffId: STAFF,
    displayName: "Synthetic Staff",
    roleLabel: "Staff",
    status: "active",
    createdAt: CREATED,
    updatedAt: CREATED,
    lastEventId: "event-test",
    entraTenantId: TENANT,
    entraObjectId: OBJECT,
    email: "test@example.invalid",
    phone: null,
    ministryAreaId: "area-test",
    ...overrides
  };
}

async function main(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);

  jwk.kid = "composition-test";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const keySet = createLocalJWKSet({ keys: [jwk] });

  async function token(
    overrides: { oid?: string; scope?: string } = {}
  ): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({
      ver: "2.0",
      tid: TENANT,
      oid: overrides.oid ?? OBJECT,
      scp: overrides.scope ?? SCOPE
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "composition-test"
      })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(privateKey);
  }

  const validToken = await token();
  const secret = generateOAuthSessionPossessionSecret();
  const digest = deriveOAuthSessionPossessionDigest(SESSION, secret);

  assert.ok(digest);

  const validSession = {
    schemaVersion: 1,
    sessionBindingId: SESSION,
    tenantId: TENANT,
    entraObjectId: OBJECT,
    canonicalStaffId: STAFF,
    status: "active",
    createdAt: CREATED,
    expiresAt: EXPIRES,
    revokedAt: null,
    revision: 0
  };

  const validVerifier = {
    schemaVersion: 1,
    sessionBindingId: SESSION,
    credentialVerifierDigest: digest,
    status: "active",
    createdAt: CREATED,
    expiresAt: EXPIRES,
    revokedAt: null,
    revision: 0
  };

  const validCredential = {
    schemaVersion: 1,
    credentialId: CREDENTIAL,
    owner: {
      tenantId: TENANT,
      entraObjectId: OBJECT,
      canonicalStaffId: STAFF,
      sessionBindingId: SESSION
    },
    status: "active",
    createdAt: CREATED,
    updatedAt: CREATED,
    expiresAt: EXPIRES,
    revision: 0,
    encryptedCredential: {
      algorithm: "AES-256-GCM",
      keyReference: "synthetic-test-key",
      keyVersion: "v1",
      nonce: "synthetic-nonce",
      ciphertext: "synthetic-ciphertext",
      authenticationTag: "synthetic-tag"
    }
  };

  const validChallenge = {
    schemaVersion: 2,
    challengeId: CHALLENGE,
    sessionBindingId: SESSION,
    credentialId: CREDENTIAL,
    operation: "credential_read",
    challengeDigest: "a".repeat(64),
    issuedAt: CREATED,
    expiresAt: EXPIRES,
    consumedAt: null,
    revision: 0
  };

  function request(
    overrides: Partial<OAuthCredentialOperationRequest> = {}
  ): OAuthCredentialOperationRequest {
    return {
      accessToken: validToken,
      sessionSecret: secret,
      credentialId: CREDENTIAL,
      challengeId: CHALLENGE,
      operation: "credential_read",
      ...overrides
    };
  }

  interface Overrides {
    staffRecords?: readonly CanonicalStaffIdentity[];
    sessions?: readonly unknown[];
    verifiers?: readonly unknown[];
    credentials?: readonly unknown[];
    challenges?: readonly unknown[];
    bindingId?: string;
    clock?: () => number;
    throwReader?: string;
    replayResult?: boolean;
    replayThrows?: boolean;
  }

  function setup(overrides: Overrides = {}) {
    let replayCalls = 0;

    const deps: OAuthCredentialOperationDependencies = {
      verificationConfiguration: {
        tenantId: TENANT,
        audience: AUDIENCE,
        requiredPermissions: {
          scopes: [SCOPE],
          roles: []
        }
      },
      identityDependencies: {
        resolveSigningKey: (header, payload) =>
          keySet(header, payload),
        readStaffDirectory: async () =>
          [...(overrides.staffRecords ?? [staff()])]
      },
      sessionBindingId: overrides.bindingId ?? SESSION,
      async readSessions() {
        if (overrides.throwReader === "sessions") {
          throw new Error("Synthetic session reader failure");
        }
        return overrides.sessions ?? [validSession];
      },
      async readPossessionVerifiers() {
        if (overrides.throwReader === "verifiers") {
          throw new Error("Synthetic possession reader failure");
        }
        return overrides.verifiers ?? [validVerifier];
      },
      async readCredentials() {
        if (overrides.throwReader === "credentials") {
          throw new Error("Synthetic credential reader failure");
        }
        return overrides.credentials ?? [validCredential];
      },
      async readReplayChallenges() {
        if (overrides.throwReader === "challenges") {
          throw new Error("Synthetic challenge reader failure");
        }
        return overrides.challenges ?? [validChallenge];
      },
      replayRepository: {
        async consumeIfAvailableV2(value) {
          replayCalls++;
          assert.equal(value.challengeId, CHALLENGE);
          assert.equal(value.sessionBindingId, SESSION);
          assert.equal(value.credentialId, CREDENTIAL);
          assert.equal(value.operation, "credential_read");
          assert.equal(
            value.expectedChallengeDigest,
            validChallenge.challengeDigest
          );
          if (overrides.replayThrows) {
            throw new Error("Synthetic atomic repository failure");
          }
          return overrides.replayResult ?? true;
        }
      },
      clock: overrides.clock ?? (() => NOW)
    };

    return {
      deps,
      get replayCalls() { return replayCalls; }
    };
  }

  // Successful composition of all mandatory checks.
  const success = setup();

  assert.deepEqual(
    await authorizeOAuthCredentialOperation(
      request(),
      success.deps
    ),
    { authorized: true }
  );
  assert.equal(success.replayCalls, 1);

  async function assertDenied(
    candidate: OAuthCredentialOperationRequest,
    overrides: Overrides = {},
    expectedReplayCalls = 0
  ): Promise<void> {
    const fixture = setup(overrides);

    assert.deepEqual(
      await authorizeOAuthCredentialOperation(
        candidate,
        fixture.deps
      ),
      denied
    );

    assert.equal(
      fixture.replayCalls,
      expectedReplayCalls,
      "Replay challenge should only be consumed after all prechecks"
    );
  }

  // Invalid token, unauthorized scope and incorrect Entra actor.
  await assertDenied(request({ accessToken: "forged-token" }));
  await assertDenied(request({
    accessToken: await token({ scope: "User.Read" })
  }));
  await assertDenied(request({
    accessToken: await token({ oid: OTHER })
  }));

  // Staff Directory ambiguity and deactivation.
  await assertDenied(request(), { staffRecords: [] });
  await assertDenied(request(), {
    staffRecords: [staff(), staff()]
  });
  await assertDenied(request(), {
    staffRecords: [staff({ status: "inactive" })]
  });

  // The trusted binding cannot be replaced by a request claim.
  await assertDenied(request(), { bindingId: OTHER });
  await assertDenied(request(), { sessions: [] });
  await assertDenied(request(), {
    sessions: [validSession, validSession]
  });
  await assertDenied(request(), {
    sessions: [{ ...validSession, status: "expired" }]
  });
  await assertDenied(request(), {
    sessions: [{
      ...validSession,
      status: "revoked",
      revokedAt: CREATED
    }]
  });

  // Invalid possession cannot burn the replay challenge.
  await assertDenied(request({ sessionSecret: "invalid" }));
  await assertDenied(request(), { verifiers: [] });
  await assertDenied(request(), {
    verifiers: [validVerifier, validVerifier]
  });
  await assertDenied(request(), {
    verifiers: [{
      ...validVerifier,
      credentialVerifierDigest: "b".repeat(64)
    }]
  });
  await assertDenied(request(), {
    verifiers: [{
      ...validVerifier,
      status: "expired"
    }]
  });

  // Credential metadata, owner, and lifecycle controls.
  await assertDenied(request(), { credentials: [] });
  await assertDenied(request(), {
    credentials: [validCredential, validCredential]
  });
  await assertDenied(request(), {
    credentials: [{ ...validCredential, status: "revoked" }]
  });
  await assertDenied(request(), {
    credentials: [{
      ...validCredential,
      owner: { ...validCredential.owner, canonicalStaffId: OTHER }
    }]
  });
  await assertDenied(request({
    credentialId: OTHER
  }));

  // Operation-specific challenge and expiration checks.
  await assertDenied(request(), { challenges: [] });
  await assertDenied(request(), {
    challenges: [validChallenge, validChallenge]
  });
  await assertDenied(request(), {
    challenges: [{
      ...validChallenge,
      operation: "credential_rotate"
    }]
  });
  await assertDenied(request(), {
    challenges: [{
      ...validChallenge,
      consumedAt: CREATED
    }]
  });
  await assertDenied(request(), {
    challenges: [{
      ...validChallenge,
      sessionBindingId: OTHER
    }]
  });
  await assertDenied(request({
    challengeId: OTHER
  }));

  // No success from replay rejection or storage uncertainty.
  await assertDenied(request(), { replayResult: false }, 1);
  await assertDenied(request(), { replayThrows: true }, 1);

  // V1 cannot be downgraded into a V2 authorization decision.
  await assertDenied(request(), {
    challenges: [{
      schemaVersion: 1,
      challengeId: CHALLENGE,
      sessionBindingId: SESSION,
      operation: "credential_read",
      challengeDigest: validChallenge.challengeDigest,
      issuedAt: CREATED,
      expiresAt: EXPIRES,
      consumedAt: null,
      revision: 0
    }]
  });

  // The replay challenge must bind the validated stored credential.
  await assertDenied(request(), {
    challenges: [{
      ...validChallenge,
      credentialId: OTHER
    }]
  });
  await assertDenied(request(), {
    challenges: [{
      ...validChallenge,
      credentialId: undefined
    }]
  });

  // Duplicate and mixed-version evidence fails closed.
  await assertDenied(request(), {
    challenges: [
      validChallenge,
      { ...validChallenge, schemaVersion: 1 }
    ]
  });

  for (const throwReader of [
    "sessions",
    "verifiers",
    "credentials",
    "challenges"
  ]) {
    await assertDenied(request(), { throwReader });
  }

  // Invalid and expired trusted clocks deny before consumption.
  await assertDenied(request(), {
    clock: () => Number.NaN
  });
  await assertDenied(request(), {
    clock: () => Date.parse(EXPIRES)
  });

  console.log(
    "authorizeOAuthCredentialOperation synthetic security tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
