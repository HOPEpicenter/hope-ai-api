import assert from "node:assert/strict";
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt
} from "node:crypto";

import {
  decryptOAuthCredentialEnvelope,
  encryptOAuthCredentialEnvelope
} from "../../src/services/authorization/oauthEncryptedEnvelopeCoordinator";

import {
  isOAuthEncryptedEnvelopeV2
} from "../../src/contracts/oauthEncryptedEnvelope.v2";

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

const rejectedReference =
  "https://other-test-vault.vault.azure.net/keys/oauth-key/" +
  "0123456789abcdef0123456789abcdef";

const pair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const olderPair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const keys = new Map([
  [currentReference, pair],
  [oldReference, olderPair]
]);

let wrapCalls = 0;
let unwrapCalls = 0;

const client: OAuthKeyWrapClient = {
  async wrapKey(reference, algorithm, dataKey) {
    wrapCalls += 1;

    assert.equal(algorithm, "RSA-OAEP-256");

    const selected = keys.get(reference);

    if (!selected) {
      throw new Error("Unrecognized synthetic test key");
    }

    return {
      keyReference: reference,
      algorithm,
      result: publicEncrypt({
        key: selected.publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      }, dataKey)
    };
  },

  async unwrapKey(reference, algorithm, wrappedKey) {
    unwrapCalls += 1;

    assert.equal(algorithm, "RSA-OAEP-256");

    const selected = keys.get(reference);

    if (!selected) {
      throw new Error("Unrecognized synthetic test key");
    }

    return {
      keyReference: reference,
      algorithm,
      result: privateDecrypt({
        key: selected.privateKey,
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
  "synthetic-refresh-token-coordinator-test-only",
  "utf8"
);

async function mustReject(
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
  const first = await encryptOAuthCredentialEnvelope(
    client, policy, plaintext, binding
  );

  const second = await encryptOAuthCredentialEnvelope(
    client, policy, plaintext, binding
  );

  assert.equal(isOAuthEncryptedEnvelopeV2(first), true);
  assert.equal(first.keyReference, currentReference);
  assert.equal(first.wrappingAlgorithm, "RSA-OAEP-256");
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.wrappedDataKey, second.wrappedDataKey);

  assert.deepEqual(
    await decryptOAuthCredentialEnvelope(
      client, policy, first, binding
    ),
    plaintext
  );

  assert.deepEqual(
    await decryptOAuthCredentialEnvelope(
      client, policy, second, binding
    ),
    plaintext
  );

  for (const [field, replacement] of [
    ["credentialId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["tenantId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    ["entraObjectId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
    ["canonicalStaffId", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
    ["sessionBindingId", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]
  ] as const) {
    await mustReject(() =>
      decryptOAuthCredentialEnvelope(
        client, policy, first,
        { ...binding, [field]: replacement }
      )
    );
  }

  for (const field of [
    "nonce",
    "ciphertext",
    "authenticationTag",
    "wrappedDataKey"
  ] as const) {
    await mustReject(() =>
      decryptOAuthCredentialEnvelope(
        client, policy,
        { ...first, [field]: alter(first[field]) },
        binding
      )
    );
  }

  const beforeInvalid = unwrapCalls;

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client, policy,
      { ...first, schemaVersion: 1 }, binding
    )
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client, policy,
      { ...first, algorithm: "AES-128-GCM" }, binding
    )
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client, policy,
      { ...first, authenticationTag: "!" }, binding
    )
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client, policy,
      { ...first, unexpected: true }, binding
    )
  );

  assert.equal(
    unwrapCalls, beforeInvalid,
    "Invalid structural metadata must be rejected before unwrap"
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client, policy,
      { ...first, keyReference: rejectedReference },
      binding
    )
  );

  assert.equal(
    unwrapCalls, beforeInvalid,
    "Unapproved key reference must not invoke unwrap"
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client,
      {
        currentKeyReference: currentReference,
        permittedKeyReferences: [currentReference]
      },
      { ...first, keyReference: oldReference },
      binding
    )
  );

  assert.equal(unwrapCalls, beforeInvalid);

  const oldPolicy: OAuthKeyWrapPolicy = {
    currentKeyReference: oldReference,
    permittedKeyReferences: [currentReference, oldReference]
  };

  const oldEnvelope = await encryptOAuthCredentialEnvelope(
    client, oldPolicy, plaintext, binding
  );

  assert.equal(oldEnvelope.keyReference, oldReference);

  assert.deepEqual(
    await decryptOAuthCredentialEnvelope(
      client, policy, oldEnvelope, binding
    ),
    plaintext
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      client,
      {
        currentKeyReference: currentReference,
        permittedKeyReferences: [currentReference]
      },
      oldEnvelope,
      binding
    )
  );

  await mustReject(() =>
    encryptOAuthCredentialEnvelope(
      client, policy, Buffer.alloc(0), binding
    )
  );

  await mustReject(() =>
    encryptOAuthCredentialEnvelope(
      client, policy, plaintext,
      { ...binding, sessionBindingId: "invalid" }
    )
  );

  const failingClient: OAuthKeyWrapClient = {
    async wrapKey() {
      throw new Error("Synthetic key service unavailable");
    },
    async unwrapKey() {
      throw new Error("Synthetic key service unavailable");
    }
  };

  await mustReject(() =>
    encryptOAuthCredentialEnvelope(
      failingClient, policy, plaintext, binding
    )
  );

  await mustReject(() =>
    decryptOAuthCredentialEnvelope(
      failingClient, policy, first, binding
    )
  );

  assert.ok(wrapCalls >= 3);
  assert.ok(unwrapCalls >= 3);

  console.log(
    "oauthEncryptedEnvelopeCoordinator synthetic tests passed"
  );
}

main().catch(() => {
  console.error("Synthetic coordinator test failure");
  process.exitCode = 1;
});
