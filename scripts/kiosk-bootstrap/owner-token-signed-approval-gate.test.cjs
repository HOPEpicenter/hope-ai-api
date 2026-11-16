"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Module = require("node:module");
const { generateKeyPairSync, sign } = require("node:crypto");
const ts = require("typescript");

Module._extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });
  module._compile(output.outputText, filename);
};

const {
  getKioskBootstrapOwnerAuthorizationConfiguration: readConfiguration
} = require(path.resolve(
  process.cwd(),
  "src/config/kioskBootstrapOwnerAuthorization.ts"
));

const {
  assessKioskBootstrapOwnerToken
} = require(path.resolve(
  process.cwd(),
  "src/services/authorization/assessKioskBootstrapOwnerToken.ts"
));

const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const ownerId = "11111111-2222-4333-8444-555555555555";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const clientId = "22222222-3333-4444-8555-666666666666";
const audience = "api://synthetic-kiosk-bootstrap";
const scope = "Kiosk.Bootstrap";
const operationId = "synthetic_operation_001";
const keyId = "synthetic_trusted_key_001";
const now = Math.floor(Date.now() / 1000);
const ownerKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001
});
const approvalKeys = generateKeyPairSync("ed25519");

function configuration() {
  return readConfiguration({
    FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION: "true",
    KIOSK_BOOTSTRAP_ENTRA_TENANT_ID: tenantId,
    KIOSK_BOOTSTRAP_OWNER_OBJECT_ID: ownerId,
    KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID: clientId,
    KIOSK_BOOTSTRAP_API_AUDIENCE: audience,
    KIOSK_BOOTSTRAP_REQUIRED_SCOPE: scope
  });
}

async function token(options = {}) {
  const jose = await import("jose");
  const claims = {
    ver: "2.0",
    tid: tenantId,
    oid: ownerId,
    azp: clientId,
    scp: scope,
    ...options.claims
  };

  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(
      options.issuer ??
        `https://login.microsoftonline.com/${tenantId}/v2.0`
    )
    .setAudience(options.audience ?? audience)
    .setIssuedAt(options.issuedAt ?? now - 60)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(ownerKeys.privateKey);
}

function approval(options = {}) {
  const issuedAt = options.issuedAt ??
    new Date(Date.now() - 60000).toISOString();
  const expiresAt = options.expiresAt ??
    new Date(Date.now() + 300000).toISOString();
  const payload = JSON.stringify({
    operationId,
    purpose: "FIRST_CANONICAL_STAFF_BOOTSTRAP",
    target: {
      subscriptionId:
        "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
      tenantId,
      resourceGroup: "rg-hope-kiosk-acceptance-20261122",
      functionApp: "hope-kiosk-acceptance-api"
    },
    ownerObjectId: ownerId,
    issuedAt,
    expiresAt
  });

  return {
    keyId,
    payload,
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      approvalKeys.privateKey
    ).toString("base64")
  };
}

async function gate(overrides = {}) {
  const {
    createOwnerTokenSignedApprovalGate
  } = await import(pathToFileURL(path.resolve(
    process.cwd(),
    "scripts/kiosk-bootstrap/owner-token-signed-approval-gate.mjs"
  )).href);

  return createOwnerTokenSignedApprovalGate(
    configuration(),
    keyId,
    {
      assessOwnerToken: assessKioskBootstrapOwnerToken,
      async resolveOwnerTokenSigningKey() {
        return ownerKeys.publicKey;
      },
      async resolvePublicKey(resolvedKeyId) {
        return {
          keyId: resolvedKeyId,
          active: true,
          publicKeyPem: approvalKeys.publicKey.export({
            type: "spki",
            format: "pem"
          })
        };
      },
      ...overrides
    }
  );
}

function assertDisabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.approvalConsumptionPermitted, false);
  assert.equal(result.realIdentityProviderVerified, false);
}

async function assess(options = {}) {
  const trustedGate = await gate(options.dependencies);
  const request = {
    operationId,
    envelope: options.approval ?? approval(),
    ...options.request
  };

  if (options.includeAccessToken !== false) {
    request.accessToken = await token(options.token);
  }

  return trustedGate.assess(request);
}

test("valid configured owner token and approval remain disabled", async () => {
  const result = await assess();

  assertDisabled(result);
  assert.equal(result.status, "TRUST_CONTRACT_MATCHED_EXECUTION_DISABLED");
  assert.equal(result.signatureValid, true);
  assert.equal(result.authenticatedOwnerMatched, true);
  assert.equal(result.trustedKeyMatched, true);
});

for (const [name, tokenOptions] of [
  ["wrong owner", { claims: { oid: otherId } }],
  ["wrong audience", { audience: "api://wrong-audience" }],
  ["wrong client", { claims: { azp: otherId } }],
  ["wrong scope", { claims: { scp: "User.Read" } }],
  ["expired token", {
    issuedAt: now - 600,
    expiresAt: now - 300
  }]
]) {
  test(`${name} is rejected before approval verification`, async () => {
    let approvalKeyCalls = 0;
    const result = await assess({
      token: tokenOptions,
      dependencies: {
        async resolvePublicKey() {
          approvalKeyCalls++;
          return {};
        }
      }
    });

    assertDisabled(result);
    assert.equal(result.status, "OWNER_IDENTITY_MISMATCH");
    assert.equal(result.signatureValid, false);
    assert.equal(approvalKeyCalls, 0);
  });
}

test("missing access token fails closed before approval-key resolution", async () => {
  let approvalKeyCalls = 0;
  const result = await assess({
    includeAccessToken: false,
    dependencies: {
      async resolvePublicKey() {
        approvalKeyCalls++;
        return {};
      }
    }
  });

  assertDisabled(result);
  assert.equal(result.status, "OWNER_IDENTITY_MISMATCH");
  assert.equal(approvalKeyCalls, 0);
});

test("request-supplied trust fields cannot override factory inputs", async () => {
  const alternateApprovalKeys = generateKeyPairSync("ed25519");
  let assessedConfiguration;
  let resolvedApprovalKeyId;

  const result = await assess({
    dependencies: {
      async assessOwnerToken(accessToken, trustedConfiguration, resolveKey) {
        assessedConfiguration = trustedConfiguration;
        return assessKioskBootstrapOwnerToken(
          accessToken,
          trustedConfiguration,
          resolveKey
        );
      },
      async resolvePublicKey(resolvedKeyId) {
        resolvedApprovalKeyId = resolvedKeyId;
        return {
          keyId: resolvedKeyId,
          active: true,
          publicKeyPem: approvalKeys.publicKey.export({
            type: "spki",
            format: "pem"
          })
        };
      }
    },
    request: {
      ownerTenantId: otherId,
      ownerObjectId: otherId,
      ownerAuthorization: {
        verificationConfigured: true,
        verificationConfiguration: {
          tenantId: otherId,
          ownerObjectId: otherId,
          audience: "api://attacker",
          requiredScope: "Attacker.Scope",
          allowedClientApplicationId: otherId
        }
      },
      configuration: {
        tenantId: otherId,
        ownerObjectId: otherId,
        audience: "api://attacker",
        requiredScope: "Attacker.Scope",
        allowedClientApplicationId: otherId
      },
      keyId: "attacker_key_001",
      publicKeyPem: alternateApprovalKeys.publicKey.export({
        type: "spki",
        format: "pem"
      })
    }
  });

  assertDisabled(result);
  assert.equal(result.status, "TRUST_CONTRACT_MATCHED_EXECUTION_DISABLED");
  assert.equal(result.signatureValid, true);
  assert.equal(result.authenticatedOwnerMatched, true);
  assert.equal(result.trustedKeyMatched, true);
  assert.deepEqual(assessedConfiguration, {
    tenantId,
    ownerObjectId: ownerId,
    audience,
    requiredScope: scope,
    allowedClientApplicationId: clientId
  });
  assert.equal(resolvedApprovalKeyId, keyId);
});

test("expired approval is rejected", async () => {
  const result = await assess({
    approval: approval({
      issuedAt: new Date(Date.now() - 600000).toISOString(),
      expiresAt: new Date(Date.now() - 300000).toISOString()
    })
  });

  assertDisabled(result);
  assert.equal(result.status, "SIGNED_APPROVAL_INVALID");
});

test("tampered approval is rejected", async () => {
  const item = approval();
  item.payload += " ";

  const result = await assess({ approval: item });

  assertDisabled(result);
  assert.equal(result.status, "SIGNED_APPROVAL_INVALID");
});

test("owner-token dependency failure fails closed", async () => {
  const result = await assess({
    dependencies: {
      async assessOwnerToken() {
        throw new Error("synthetic verifier failure");
      }
    }
  });

  assertDisabled(result);
  assert.equal(result.status, "OWNER_AUTHENTICATION_FAILED");
});

test("trusted-key dependency failure fails closed", async () => {
  const result = await assess({
    dependencies: {
      async resolvePublicKey() {
        throw new Error("synthetic key failure");
      }
    }
  });

  assertDisabled(result);
  assert.equal(result.status, "TRUSTED_KEY_UNAVAILABLE");
});
