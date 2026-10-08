import assert from "node:assert/strict";
import {
  buildOAuthEncryptedAadV1,
  isOAuthEncryptedAadBindingV1,
  isOAuthEncryptedEnvelopeV2,
  OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION
} from "../../src/contracts/oauthEncryptedEnvelope.v2";

const binding = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  entraObjectId: "33333333-3333-4333-8333-333333333333",
  canonicalStaffId: "44444444-4444-4444-8444-444444444444",
  sessionBindingId: "55555555-5555-4555-8555-555555555555"
};

const encode = (size: number): string =>
  Buffer.alloc(size, 0x42).toString("base64url");

const envelope = {
  schemaVersion: 2,
  algorithm: "AES-256-GCM",
  wrappingAlgorithm: "RSA-OAEP-256",
  keyReference:
    "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
    "0123456789abcdef0123456789abcdef",
  wrappedDataKey: encode(256),
  nonce: encode(12),
  ciphertext: encode(32),
  authenticationTag: encode(16),
  aadVersion: 1
};

assert.equal(OAUTH_ENCRYPTED_ENVELOPE_SCHEMA_VERSION, 2);
assert.equal(isOAuthEncryptedEnvelopeV2(envelope), true);
assert.equal(isOAuthEncryptedAadBindingV1(binding), true);

function rejectEnvelope(changes: Record<string, unknown>): void {
  assert.equal(
    isOAuthEncryptedEnvelopeV2({ ...envelope, ...changes }),
    false
  );
}

rejectEnvelope({ schemaVersion: 1 });
rejectEnvelope({ schemaVersion: 3 });
rejectEnvelope({ algorithm: "AES-128-GCM" });
rejectEnvelope({ wrappingAlgorithm: "RSA-OAEP" });
rejectEnvelope({ aadVersion: 2 });
rejectEnvelope({ keyReference: "https://example.com/key" });
rejectEnvelope({
  keyReference: "https://hope-test-vault.vault.azure.net/keys/oauth-key"
});
rejectEnvelope({
  keyReference:
    "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
    "0123456789abcdef0123456789abcdef?foo=bar"
});
rejectEnvelope({ wrappedDataKey: encode(16) });
rejectEnvelope({ wrappedDataKey: encode(1025) });
rejectEnvelope({ wrappedDataKey: "!" });
rejectEnvelope({ nonce: encode(11) });
rejectEnvelope({ nonce: encode(13) });
rejectEnvelope({ nonce: "AB" });
rejectEnvelope({ ciphertext: "" });
rejectEnvelope({ ciphertext: "!" });
rejectEnvelope({ authenticationTag: encode(15) });
rejectEnvelope({ authenticationTag: encode(17) });
rejectEnvelope({ authenticationTag: encode(16) + "=" });

assert.equal(
  isOAuthEncryptedEnvelopeV2({ ...envelope, unexpected: true }),
  false
);
assert.equal(isOAuthEncryptedEnvelopeV2(null), false);
assert.equal(isOAuthEncryptedEnvelopeV2([]), false);

assert.equal(
  isOAuthEncryptedAadBindingV1({
    ...binding,
    sessionBindingId: "not-a-uuid"
  }),
  false
);

assert.equal(
  isOAuthEncryptedAadBindingV1({
    ...binding,
    unexpected: "value"
  }),
  false
);

assert.equal(
  isOAuthEncryptedAadBindingV1({
    ...binding,
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase()
  }),
  false
);

const aad = buildOAuthEncryptedAadV1(binding);
const expected = JSON.stringify([
  "hope-oauth-credential-aad",
  1,
  2,
  binding.credentialId,
  binding.tenantId,
  binding.entraObjectId,
  binding.canonicalStaffId,
  binding.sessionBindingId
]);

assert.equal(aad.toString("utf8"), expected);

assert.deepEqual(buildOAuthEncryptedAadV1(binding), aad);

const differentSession = buildOAuthEncryptedAadV1({
  ...binding,
  sessionBindingId: "66666666-6666-4666-8666-666666666666"
});

assert.notDeepEqual(differentSession, aad);

const differentCredential = buildOAuthEncryptedAadV1({
  ...binding,
  credentialId: "77777777-7777-4777-8777-777777777777"
});

assert.notDeepEqual(differentCredential, aad);

for (const [field, changedValue] of [
  ["tenantId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ["entraObjectId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ["canonicalStaffId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"]
] as const) {
  const changedBinding = { ...binding, [field]: changedValue };

  assert.equal(isOAuthEncryptedAadBindingV1(changedBinding), true);
  assert.notDeepEqual(buildOAuthEncryptedAadV1(changedBinding), aad);
}
assert.throws(
  () =>
    buildOAuthEncryptedAadV1({
      ...binding,
      tenantId: "invalid"
    }),
  /Invalid OAuth credential AAD binding/
);

console.log("oauthEncryptedEnvelope v2 contract tests passed");
