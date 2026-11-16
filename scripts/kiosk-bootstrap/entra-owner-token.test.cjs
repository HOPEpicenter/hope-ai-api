"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { generateKeyPairSync } = require("node:crypto");
const ts = require("typescript");

/*
 * Test-only TypeScript loader for the existing backend source.
 * No application source or compiler configuration is modified.
 */
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
const permission = "Kiosk.Bootstrap";

const configuration = () => ({
  tenantId,
  ownerObjectId: ownerId,
  audience,
  requiredScope: permission,
  allowedClientApplicationId: clientId
});

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001
});

const now = Math.floor(Date.now() / 1000);
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

function claims(overrides = {}) {
  return {
    ver: "2.0",
    tid: tenantId,
    oid: ownerId,
    azp: clientId,
    scp: permission,
    ...overrides
  };
}

async function syntheticJwt(jose, options = {}) {
  const {
    claimsOverride = {},
    signedAudience = audience,
    signedIssuer = issuer,
    issuedAt = now - 60,
    expiresAt = now + 300
  } = options;

  return new jose.SignJWT(claims(claimsOverride))
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(signedIssuer)
    .setAudience(signedAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(keys.privateKey);
}

async function verifyToken(token, config = configuration()) {
  // Synthetic signing-key resolver only. No Microsoft JWKS
  // request is made by this test.
  return assessKioskBootstrapOwnerToken(
    token,
    config,
    async () => keys.publicKey
  );
}

function assertDisabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.approvalConsumptionPermitted, false);
  assert.equal(result.authorizationGranted, false);
}

async function assertRejected(token, config = configuration()) {
  const result = await verifyToken(token, config);
  assertDisabled(result);
  assert.equal(result.identityMatched, false);
  assert.equal(result.tokenPermissionVerified, false);
  assert.notEqual(
    result.status,
    "VERIFIED_OWNER_TOKEN_EXECUTION_DISABLED"
  );
}

test("matching signed owner token remains non-executable", async () => {
  const jose = await import("jose");
  const result = await verifyToken(await syntheticJwt(jose));

  assertDisabled(result);
  assert.equal(result.identityMatched, true);
  assert.equal(result.tokenPermissionVerified, true);
  assert.equal(
    result.status,
    "VERIFIED_OWNER_TOKEN_EXECUTION_DISABLED"
  );
});

test("wrong owner object ID is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    claimsOverride: { oid: otherId }
  }));
});

test("wrong token audience is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    signedAudience: "api://wrong-audience"
  }));
});

test("wrong tenant claim is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    claimsOverride: { tid: otherId }
  }));
});

test("wrong issuer is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    signedIssuer:
      `https://login.microsoftonline.com/${otherId}/v2.0`
  }));
});

test("wrong calling application is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    claimsOverride: { azp: otherId }
  }));
});

test("missing bootstrap permission is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    claimsOverride: { scp: "User.Read" }
  }));
});

test("expired token is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    issuedAt: now - 600,
    expiresAt: now - 300
  }));
});

test("future-issued token is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    issuedAt: now + 300,
    expiresAt: now + 600
  }));
});

test("ID-token-specific claim is rejected", async () => {
  const jose = await import("jose");
  await assertRejected(await syntheticJwt(jose, {
    claimsOverride: { nonce: "synthetic-nonce" }
  }));
});

test("missing trusted configuration is denied", async () => {
  const jose = await import("jose");
  const result = await assessKioskBootstrapOwnerToken(
    await syntheticJwt(jose),
    undefined
  );

  assertDisabled(result);
  assert.equal(
    result.status,
    "BOOTSTRAP_TOKEN_CONFIGURATION_NOT_VERIFIED"
  );
});

test("untrusted tenant configuration is denied", async () => {
  const jose = await import("jose");
  const result = await verifyToken(
    await syntheticJwt(jose),
    {
      ...configuration(),
      tenantId: otherId
    }
  );

  assertDisabled(result);
  assert.equal(
    result.status,
    "BOOTSTRAP_TOKEN_CONFIGURATION_NOT_VERIFIED"
  );
});

test("invalid token cannot enable Staff creation", async () => {
  const result = await verifyToken(
    "caller-approval-is-not-an-access-token"
  );

  assertDisabled(result);
  assert.equal(result.identityMatched, false);
  assert.equal(result.tokenPermissionVerified, false);
});