import assert from "node:assert/strict";

import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt
} from "node:crypto";

import {
  encryptOAuthCredentialEnvelopeV3,
  decryptOAuthCredentialEnvelopeV3
} from "../../src/services/authorization/oauthEncryptedEnvelopeV3Coordinator";

import {
  isOAuthEncryptedEnvelopeV3
} from "../../src/contracts/oauthEncryptedEnvelope.v3";

import {
  OAuthKeyWrapClient,
  OAuthKeyWrapPolicy
} from "../../src/services/authorization/oauthKeyVaultWrapping";

const currentReference =
  "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
  "0123456789abcdef0123456789abcdef";

const oldReference =
  "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
  "abcdef0123456789abcdef0123456789";

const foreignReference =
  "https://foreign-test-vault.vault.azure.net/keys/oauth-key/" +
  "0123456789abcdef0123456789abcdef";

const currentPair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const oldPair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const keys = new Map([
  [currentReference, currentPair],
  [oldReference, oldPair]
]);

let wrapCalls = 0;
let unwrapCalls = 0;

const client: OAuthKeyWrapClient = {
  async wrapKey(reference, algorithm, dataKey) {
    wrapCalls += 1;
    assert.equal(algorithm, "RSA-OAEP-256");

    const pair = keys.get(reference);
    if (!pair) throw new Error("Missing synthetic RSA key");

    return {
      keyReference: reference,
      algorithm,
      result: publicEncrypt({
        key: pair.publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      }, dataKey)
    };
  },

  async unwrapKey(reference, algorithm, wrappedKey) {
    unwrapCalls += 1;
    assert.equal(algorithm, "RSA-OAEP-256");

    const pair = keys.get(reference);
    if (!pair) throw new Error("Missing synthetic RSA key");

    return {
      keyReference: reference,
      algorithm,
      result: privateDecrypt({
        key: pair.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      }, wrappedKey)
    };
  }
};

const policy: OAuthKeyWrapPolicy = {
  currentKeyReference: currentReference,
  permittedKeyReferences: [currentReference, oldReference]
};

const binding = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  entraObjectId: "33333333-3333-4333-8333-333333333333",
  canonicalStaffId: "44444444-4444-4444-8444-444444444444",
  sessionBindingId: "55555555-5555-4555-8555-555555555555"
};

const plaintext = Buffer.from(
  "synthetic-v3-credential-only",
  "utf8"
);

async function reject(
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(operation);
}

function alter(encoded: string): string {
  const bytes = Buffer.from(encoded, "base64url");
  bytes[0] ^= 1;
  return bytes.toString("base64url");
}

async function main(): Promise<void> {
  const first = await encryptOAuthCredentialEnvelopeV3(
    client, policy, plaintext, binding
  );

  const second = await encryptOAuthCredentialEnvelopeV3(
    client, policy, plaintext, binding
  );

  assert.equal(isOAuthEncryptedEnvelopeV3(first), true);
  assert.equal(first.schemaVersion, 3);
  assert.equal(first.aadVersion, 2);
  assert.equal(first.keyReference, currentReference);

  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.wrappedDataKey, second.wrappedDataKey);

  assert.deepEqual(
    await decryptOAuthCredentialEnvelopeV3(
      client, policy, first, binding
    ),
    plaintext
  );

  for (const field of [
    "credentialId",
    "tenantId",
    "entraObjectId",
    "canonicalStaffId",
    "sessionBindingId"
  ] as const) {
    await reject(() =>
      decryptOAuthCredentialEnvelopeV3(
        client,
        policy,
        first,
        {
          ...binding,
          [field]: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        }
      )
    );
  }

  const beforeInvalid = unwrapCalls;

  for (const invalid of [
    { ...first, schemaVersion: 2 },
    { ...first, aadVersion: 1 },
    { ...first, algorithm: "AES-128-GCM" },
    { ...first, wrappingAlgorithm: "RSA-OAEP" },
    { ...first, nonce: "!" },
    { ...first, authenticationTag: "!" },
    { ...first, extra: "unexpected" }
  ]) {
    await reject(() =>
      decryptOAuthCredentialEnvelopeV3(
        client, policy, invalid, binding
      )
    );
  }

  assert.equal(
    unwrapCalls,
    beforeInvalid,
    "Invalid v3 envelope must never invoke key unwrap"
  );

  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client, policy,
      { ...first, keyReference: foreignReference },
      binding
    )
  );

  assert.equal(
    unwrapCalls,
    beforeInvalid,
    "Foreign key reference must fail before unwrap"
  );

  // Same wrapped key, but different APPROVED reference.
  // The metadata remains structurally valid. Authentication
  // or key unwrap must fail.
  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client, policy,
      { ...first, keyReference: oldReference },
      binding
    )
  );

  for (const field of [
    "wrappedDataKey",
    "nonce",
    "ciphertext",
    "authenticationTag"
  ] as const) {
    await reject(() =>
      decryptOAuthCredentialEnvelopeV3(
        client,
        policy,
        { ...first, [field]: alter(first[field]) },
        binding
      )
    );
  }

  // Replace metadata with another valid envelope's wrapping result.
  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client,
      policy,
      {
        ...first,
        wrappedDataKey: second.wrappedDataKey
      },
      binding
    )
  );

  // Exchange ciphertext while retaining the original tag.
  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client,
      policy,
      { ...first, ciphertext: second.ciphertext },
      binding
    )
  );

  const oldPolicy: OAuthKeyWrapPolicy = {
    currentKeyReference: oldReference,
    permittedKeyReferences: [currentReference, oldReference]
  };

  const previous = await encryptOAuthCredentialEnvelopeV3(
    client, oldPolicy, plaintext, binding
  );

  assert.equal(previous.keyReference, oldReference);

  assert.deepEqual(
    await decryptOAuthCredentialEnvelopeV3(
      client, policy, previous, binding
    ),
    plaintext
  );

  const revokedPolicy: OAuthKeyWrapPolicy = {
    currentKeyReference: currentReference,
    permittedKeyReferences: [currentReference]
  };

  const beforeRevocation = unwrapCalls;

  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client, revokedPolicy, previous, binding
    )
  );

  assert.equal(
    unwrapCalls,
    beforeRevocation,
    "Revoked key version must fail before unwrap"
  );

  await reject(() =>
    encryptOAuthCredentialEnvelopeV3(
      client, policy, Buffer.alloc(0), binding
    )
  );

  await reject(() =>
    encryptOAuthCredentialEnvelopeV3(
      client,
      policy,
      plaintext,
      { ...binding, credentialId: "invalid" }
    )
  );

  const beforeBadBinding = unwrapCalls;

  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      client,
      policy,
      first,
      { ...binding, credentialId: "invalid" }
    )
  );

  assert.equal(unwrapCalls, beforeBadBinding);

  const failingClient: OAuthKeyWrapClient = {
    async wrapKey() {
      throw new Error("Synthetic provider unavailable");
    },
    async unwrapKey() {
      throw new Error("Synthetic provider unavailable");
    }
  };

  await reject(() =>
    encryptOAuthCredentialEnvelopeV3(
      failingClient, policy, plaintext, binding
    )
  );

  await reject(() =>
    decryptOAuthCredentialEnvelopeV3(
      failingClient, policy, first, binding
    )
  );

  // A deliberately shared RSA key across two approved references:
  // unwrap succeeds, but AES-GCM must reject the reference change.
  const sharedClient: OAuthKeyWrapClient = {
    ...client,
    async unwrapKey(reference, algorithm, wrappedKey) {
      assert.equal(algorithm, "RSA-OAEP-256");
      assert.ok(
        reference === currentReference ||
        reference === oldReference
      );

      return {
        keyReference: reference,
        algorithm,
        result: privateDecrypt({
          key: currentPair.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256"
        }, wrappedKey)
      };
    }
  };

  await assert.rejects(
    () => decryptOAuthCredentialEnvelopeV3(
      sharedClient,
      policy,
      { ...first, keyReference: oldReference },
      binding
    ),
    /OAuth v3 envelope decryption failed/,
    "AAD must reject changed key references even if unwrap succeeds"
  );

  assert.ok(wrapCalls >= 3);
  assert.ok(unwrapCalls >= 3);

  console.log(
    "oauthEncryptedEnvelopeV3Coordinator synthetic security tests passed"
  );
}

main().catch((error: unknown) => {
  console.error("V3 coordinator synthetic tests failed");
  process.exitCode = 1;
});
