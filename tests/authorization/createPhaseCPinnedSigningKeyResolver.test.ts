import assert from "node:assert/strict";

import {
  createHash,
  generateKeyPairSync
} from "node:crypto";

import {
  jwtVerify,
  SignJWT
} from "jose";

import {
  createPhaseCPinnedSigningKeyResolver
} from "../../src/services/authorization/createPhaseCPinnedSigningKeyResolver";

async function main(): Promise<void> {
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const other = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const publicKeyPem = keys.publicKey.export({
    type: "spki",
    format: "pem"
  }).toString();

  const pin = createHash("sha256")
    .update(
      keys.publicKey.export({
        type: "spki",
        format: "der"
      })
    )
    .digest("hex");

  const config = {
    publicKeyPem,
    publicKeySha256: pin,
    keyId: "synthetic-phase-c-key"
  };

  const resolver =
    createPhaseCPinnedSigningKeyResolver(config);

  async function token(
    signingKey: typeof keys.privateKey,
    header: Record<string, unknown> = {}
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      operationId: "synthetic-operation"
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: config.keyId,
        ...header
      })
      .setIssuer("https://synthetic-issuer.invalid")
      .setAudience("synthetic-phase-c")
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(signingKey);
  }

  const verified = await jwtVerify(
    await token(keys.privateKey),
    resolver,
    {
      algorithms: ["RS256"],
      issuer: "https://synthetic-issuer.invalid",
      audience: "synthetic-phase-c"
    }
  );

  assert.equal(
    verified.payload.operationId,
    "synthetic-operation"
  );

  console.log("PASS=PINNED_PUBLIC_KEY_VERIFIES_SIGNATURE");

  assert.throws(
    () => createPhaseCPinnedSigningKeyResolver({
      ...config,
      publicKeySha256: "0".repeat(64)
    }),
    /PIN_MISMATCH/
  );

  console.log("PASS=WRONG_PUBLIC_KEY_PIN_DENIED");

  await assert.rejects(
    jwtVerify(
      await token(other.privateKey),
      resolver,
      {
        algorithms: ["RS256"],
        issuer: "https://synthetic-issuer.invalid",
        audience: "synthetic-phase-c"
      }
    )
  );

  console.log("PASS=UNTRUSTED_SIGNER_DENIED");

  await assert.rejects(
    jwtVerify(
      await token(keys.privateKey, {
        kid: "attacker-key"
      }),
      resolver,
      { algorithms: ["RS256"] }
    )
  );

  console.log("PASS=UNKNOWN_KEY_ID_DENIED");

  for (const header of [
    { jku: "https://attacker.invalid/keys" },
    { x5u: "https://attacker.invalid/cert" },
    { jwk: { kty: "RSA" } }
  ]) {
    await assert.rejects(
      jwtVerify(
        await token(keys.privateKey, header),
        resolver,
        { algorithms: ["RS256"] }
      )
    );
  }

  console.log("PASS=JWT_SUPPLIED_KEY_METADATA_DENIED");

  assert.throws(
    () => createPhaseCPinnedSigningKeyResolver({
      ...config,
      publicKeySha256: "not-a-fingerprint"
    }),
    /TRUST_ANCHOR_INVALID/
  );

  console.log("PASS=MALFORMED_TRUST_CONFIGURATION_DENIED");

  console.log("PHASE_C_PINNED_KEY_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
