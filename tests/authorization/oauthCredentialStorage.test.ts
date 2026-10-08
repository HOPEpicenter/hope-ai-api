import assert from "node:assert/strict";
import {
  OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION,
  isOAuthCredentialMetadataV1,
  isOAuthCredentialAuditV1,
  isOAuthCredentialMutationPreconditionV1
} from "../../src/contracts/oauthCredentialStorage.v1";

const record = {
  schemaVersion: OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION,
  credentialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner: {
    tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    entraObjectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    canonicalStaffId: "staff-fixture",
    sessionBindingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  },
  status: "active",
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  expiresAt: "2026-10-09T00:00:00.000Z",
  revision: 1,
  encryptedCredential: {
    algorithm: "AES-256-GCM",
    keyReference: "test-only-key-reference",
    keyVersion: "v1",
    nonce: "test-only-nonce",
    ciphertext: "test-only-ciphertext",
    authenticationTag: "test-only-tag"
  }
};

assert.equal(isOAuthCredentialMetadataV1(record), true);

const invalidRecords: unknown[] = [
  null,
  {},
  { ...record, schemaVersion: 2 },
  { ...record, credentialId: "staff-fixture" },
  { ...record, status: "unknown" },
  { ...record, revision: -1 },
  { ...record, revision: 1.5 },
  { ...record, expiresAt: "invalid-date" },
  { ...record, refreshToken: "forbidden" },
  { ...record, accessToken: "forbidden" },
  { ...record, clientSecret: "forbidden" },
  { ...record, owner: { ...record.owner, tenantId: "" } },
  { ...record, owner: { ...record.owner, sessionBindingId: "" } },
  { ...record, owner: { ...record.owner, refreshToken: "forbidden" } },
  {
    ...record,
    encryptedCredential: {
      ...record.encryptedCredential,
      algorithm: "unknown"
    }
  },
  {
    ...record,
    encryptedCredential: {
      ...record.encryptedCredential,
      plaintext: "forbidden"
    }
  }
];

for (const invalid of invalidRecords) {
  assert.equal(isOAuthCredentialMetadataV1(invalid), false);
}

assert.equal(
  isOAuthCredentialMetadataV1({
    ...record,
    credentialId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    owner: {
      ...record.owner,
      sessionBindingId: "ffffffff-ffff-4fff-8fff-ffffffffffff"
    }
  }),
  true
);

const additionalInvalidRecords: unknown[] = [
  { ...record, unexpectedProperty: "not-allowed" },
  { ...record, encryptedAccessToken: "not-allowed" },
  {
    ...record,
    owner: { ...record.owner, unexpectedProperty: "not-allowed" }
  },
  {
    ...record,
    encryptedCredential: {
      ...record.encryptedCredential,
      extraField: "not-allowed"
    }
  },
  { ...record, createdAt: "2026-10-09T00:00:00.000Z" },
  { ...record, updatedAt: "2026-10-10T00:00:00.000Z" },
  { ...record, expiresAt: record.updatedAt },
  { ...record, expiresAt: "2026-02-30T00:00:00.000Z" },
  { ...record, expiresAt: "2026-10-09T00:00:00Z" }
];

for (const invalid of additionalInvalidRecords) {
  assert.equal(isOAuthCredentialMetadataV1(invalid), false);
}
const auditRecord = {
  schemaVersion: OAUTH_CREDENTIAL_STORAGE_SCHEMA_VERSION,
  credentialId: record.credentialId,
  action: "rotated",
  revision: 2,
  occurredAt: "2026-10-08T01:00:00.000Z",
  correlationId: "11111111-1111-4111-8111-111111111111"
};

assert.equal(isOAuthCredentialAuditV1(auditRecord), true);

for (const invalid of [
  null,
  {},
  { ...auditRecord, action: "unknown" },
  { ...auditRecord, credentialId: "invalid" },
  { ...auditRecord, revision: -1 },
  { ...auditRecord, revision: 1.5 },
  { ...auditRecord, occurredAt: "invalid" },
  { ...auditRecord, correlationId: "" },
  { ...auditRecord, refreshToken: "forbidden" },
  { ...auditRecord, unexpected: "extra" }
]) {
  assert.equal(isOAuthCredentialAuditV1(invalid), false);
}

for (const action of ["created", "rotated", "revoked", "expired"]) {
  assert.equal(
    isOAuthCredentialAuditV1({ ...auditRecord, action }),
    true
  );
}

const precondition = {
  credentialId: record.credentialId,
  owner: record.owner,
  expectedVersion: 'W/"test-etag"',
  expectedRevision: 1
};

assert.equal(
  isOAuthCredentialMutationPreconditionV1(precondition),
  true
);

for (const invalid of [
  null,
  {},
  { ...precondition, credentialId: "" },
  { ...precondition, expectedVersion: "" },
  { ...precondition, expectedVersion: "*" },
  { ...precondition, expectedVersion: " invalid " },
  { ...precondition, expectedVersion: "bad\netag" },
  { ...precondition, expectedVersion: "x".repeat(257) },
  { ...precondition, expectedRevision: -1 },
  { ...precondition, expectedRevision: 1.5 },
  { ...precondition, refreshToken: "forbidden" },
  { ...precondition, owner: { ...record.owner, tenantId: "" } },
  { ...precondition, owner: { ...record.owner, sessionBindingId: "" } },
  { ...precondition, owner: { ...record.owner, accessToken: "forbidden" } }
]) {
  assert.equal(
    isOAuthCredentialMutationPreconditionV1(invalid),
    false
  );
}

assert.equal(
  isOAuthCredentialMutationPreconditionV1({
    ...precondition,
    owner: {
      ...record.owner,
      sessionBindingId: "22222222-2222-4222-8222-222222222222"
    }
  }),
  true
);
console.log("oauthCredentialStorage contract tests passed");
