import assert from "node:assert/strict";

import {
  buildOAuthEncryptedAadV2,
  isOAuthEncryptedEnvelopeV3,
  isOAuthEnvelopeMetadataV3
} from "../../src/contracts/oauthEncryptedEnvelope.v3";

import {
  buildOAuthEncryptedAadV1,
  isOAuthEncryptedEnvelopeV2
} from "../../src/contracts/oauthEncryptedEnvelope.v2";

const binding = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  entraObjectId: "33333333-3333-4333-8333-333333333333",
  canonicalStaffId: "44444444-4444-4444-8444-444444444444",
  sessionBindingId: "55555555-5555-4555-8555-555555555555"
};

const metadata = {
  algorithm: "AES-256-GCM" as const,
  wrappingAlgorithm: "RSA-OAEP-256" as const,
  keyReference:
    "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
    "0123456789abcdef0123456789abcdef",
  wrappedDataKey: Buffer.alloc(256, 7).toString("base64url")
};

const envelope = {
  ...metadata,
  schemaVersion: 3,
  aadVersion: 2,
  nonce: Buffer.alloc(12, 1).toString("base64url"),
  ciphertext: Buffer.from("synthetic").toString("base64url"),
  authenticationTag: Buffer.alloc(16, 2).toString("base64url")
};

assert.equal(isOAuthEnvelopeMetadataV3(metadata), true);
assert.equal(isOAuthEncryptedEnvelopeV3(envelope), true);
assert.equal(isOAuthEncryptedEnvelopeV2(envelope), false);

const aad = buildOAuthEncryptedAadV2(binding, metadata);

assert.deepEqual(
  aad,
  buildOAuthEncryptedAadV2(binding, metadata)
);

assert.notDeepEqual(
  aad,
  buildOAuthEncryptedAadV1(binding),
  "v2 and v3 AAD must be domain-separated"
);

function differentAad(
  nextBinding: typeof binding,
  nextMetadata: typeof metadata
): void {
  assert.notDeepEqual(
    aad,
    buildOAuthEncryptedAadV2(nextBinding, nextMetadata)
  );
}

for (const field of [
  "credentialId",
  "tenantId",
  "entraObjectId",
  "canonicalStaffId",
  "sessionBindingId"
] as const) {
  differentAad(
    {
      ...binding,
      [field]: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    },
    metadata
  );
}

differentAad(binding, {
  ...metadata,
  keyReference:
    "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
    "abcdef0123456789abcdef0123456789"
});

differentAad(binding, {
  ...metadata,
  wrappedDataKey: Buffer.alloc(256, 8).toString("base64url")
});

for (const [field, value] of [
  ["schemaVersion", 2],
  ["aadVersion", 1],
  ["algorithm", "AES-128-GCM"],
  ["wrappingAlgorithm", "RSA-OAEP"],
  ["keyReference", "https://unapproved.example/keys/key/version"],
  ["wrappedDataKey", "!"],
  ["nonce", "!"],
  ["ciphertext", ""],
  ["authenticationTag", "!"]
] as const) {
  assert.equal(
    isOAuthEncryptedEnvelopeV3({
      ...envelope,
      [field]: value
    }),
    false,
    `Must reject invalid ${field}`
  );
}

assert.equal(
  isOAuthEncryptedEnvelopeV3({
    ...envelope,
    extra: "unrecognized"
  }),
  false
);

assert.throws(() =>
  buildOAuthEncryptedAadV2(
    { ...binding, credentialId: "invalid" },
    metadata
  )
);

assert.throws(() =>
  buildOAuthEncryptedAadV2(
    binding,
    { ...metadata, wrappedDataKey: "!" }
  )
);

assert.equal(
  isOAuthEncryptedEnvelopeV3({
    ...envelope,
    wrappedDataKey: Buffer.alloc(256, 8).toString("base64url")
  }),
  true,
  "Structural validation alone does not prove authenticity"
);

console.log("oauthEncryptedEnvelopeV3 contract tests passed");
