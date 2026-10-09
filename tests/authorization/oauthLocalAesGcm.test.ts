import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  decryptOAuthLocalPayload,
  encryptOAuthLocalPayload
} from "../../src/services/authorization/oauthLocalAesGcm";

const binding = {
  credentialId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  entraObjectId: "33333333-3333-4333-8333-333333333333",
  canonicalStaffId: "44444444-4444-4444-8444-444444444444",
  sessionBindingId: "55555555-5555-4555-8555-555555555555"
};

const key = randomBytes(32);
const syntheticCredential = Buffer.from(
  "synthetic-oauth-refresh-token-for-tests-only",
  "utf8"
);

const first = encryptOAuthLocalPayload(
  key,
  syntheticCredential,
  binding
);

const second = encryptOAuthLocalPayload(
  key,
  syntheticCredential,
  binding
);

assert.deepEqual(
  decryptOAuthLocalPayload(key, first, binding),
  syntheticCredential
);

assert.deepEqual(
  decryptOAuthLocalPayload(key, second, binding),
  syntheticCredential
);

assert.notEqual(first.nonce, second.nonce);
assert.notEqual(first.ciphertext, second.ciphertext);

assert.equal(
  Buffer.from(first.nonce, "base64url").length,
  12
);

assert.equal(
  Buffer.from(first.authenticationTag, "base64url").length,
  16
);

assert.equal(
  Buffer.from(first.ciphertext, "base64url").equals(
    syntheticCredential
  ),
  false
);

function mustReject(operation: () => unknown): void {
  assert.throws(operation);
}

mustReject(() =>
  decryptOAuthLocalPayload(randomBytes(32), first, binding)
);

for (const [field, replacement] of [
  ["credentialId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ["tenantId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ["entraObjectId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  ["canonicalStaffId", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
  ["sessionBindingId", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]
] as const) {
  mustReject(() =>
    decryptOAuthLocalPayload(key, first, {
      ...binding,
      [field]: replacement
    })
  );
}

function altered(encoded: string): string {
  const bytes = Buffer.from(encoded, "base64url");
  bytes[0] ^= 0x01;
  return bytes.toString("base64url");
}

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    ciphertext: altered(first.ciphertext)
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    authenticationTag: altered(first.authenticationTag)
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    nonce: altered(first.nonce)
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    authenticationTag: "!"
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    nonce: "AA"
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    ciphertext: ""
  }, binding)
);

mustReject(() =>
  decryptOAuthLocalPayload(key, {
    ...first,
    unexpected: true
  } as typeof first, binding)
);

mustReject(() =>
  encryptOAuthLocalPayload(
    randomBytes(16),
    syntheticCredential,
    binding
  )
);

mustReject(() =>
  encryptOAuthLocalPayload(
    randomBytes(33),
    syntheticCredential,
    binding
  )
);

mustReject(() =>
  encryptOAuthLocalPayload(
    key,
    Buffer.alloc(0),
    binding
  )
);

mustReject(() =>
  encryptOAuthLocalPayload(
    key,
    syntheticCredential,
    { ...binding, sessionBindingId: "invalid" }
  )
);

assert.deepEqual(
  decryptOAuthLocalPayload(key, first, binding),
  syntheticCredential
);

console.log("oauthLocalAesGcm synthetic crypto tests passed");
