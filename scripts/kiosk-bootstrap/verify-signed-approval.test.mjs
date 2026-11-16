import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync, sign
} from "node:crypto";

import {
  verifySignedBootstrapApproval
} from "./verify-signed-approval.mjs";

import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

const nowMs = Date.parse("2026-11-16T12:00:00.000Z");
const ownerObjectId = "11111111-2222-4333-8444-555555555555";
const operationId = "synthetic_operation_001";
const purpose = "FIRST_CANONICAL_STAFF_BOOTSTRAP";

const keys = generateKeyPairSync("ed25519");
const trusted = {
  publicKeyPem: keys.publicKey.export({
    type: "spki",
    format: "pem"
  }),
  keyId: "synthetic_key_001",
  ownerObjectId,
  nowMs
};

const expected = {
  operationId,
  purpose,
  target: { ...KIOSK_BOOTSTRAP_TARGET }
};

function claims() {
  return {
    operationId,
    purpose,
    target: { ...KIOSK_BOOTSTRAP_TARGET },
    ownerObjectId,
    issuedAt: "2026-11-16T11:59:00.000Z",
    expiresAt: "2026-11-16T12:05:00.000Z"
  };
}

function envelope(payloadClaims = claims()) {
  const payload = JSON.stringify(payloadClaims);
  return {
    keyId: trusted.keyId,
    payload,
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      keys.privateKey
    ).toString("base64")
  };
}

function disabled(result) {
  assert.equal(result.verified, false);
  assert.equal(result.ownerIdentityVerified, false);
  assert.equal(result.actorProvenanceVerified, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.replayProtectionVerified, false);
}

test("valid signed scope is recognized but not authorized", () => {
  const result = verifySignedBootstrapApproval(
    envelope(), expected, trusted
  );
  disabled(result);
  assert.equal(result.signatureValid, true);
  assert.equal(
    result.status,
    "SIGNATURE_VALID_ADDITIONAL_AUTHORITY_REQUIRED"
  );
});

test("unsigned approval flags cannot grant permission", () => {
  const result = verifySignedBootstrapApproval(
    { ...envelope(), ownerApproved: true },
    expected,
    { ...trusted, keyId: "different_trusted_key" }
  );
  disabled(result);
  assert.equal(result.signatureValid, false);
});

test("tampered signed payload is rejected", () => {
  const item = envelope();
  item.payload = item.payload.replace(
    operationId, "synthetic_operation_999"
  );
  const result = verifySignedBootstrapApproval(
    item, expected, trusted
  );
  disabled(result);
  assert.equal(result.signatureValid, false);
});

test("wrong trusted owner identity is rejected", () => {
  const result = verifySignedBootstrapApproval(
    envelope(),
    expected,
    {
      ...trusted,
      ownerObjectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    }
  );
  disabled(result);
  assert.equal(result.status, "SIGNED_SCOPE_MISMATCH");
});

test("wrong signed target is rejected", () => {
  const item = claims();
  item.target.functionApp = "incorrect-app";
  const result = verifySignedBootstrapApproval(
    envelope(item), expected, trusted
  );
  disabled(result);
  assert.equal(result.status, "SIGNED_SCOPE_MISMATCH");
});

test("expired signed approval is rejected", () => {
  const item = claims();
  item.issuedAt = "2026-11-16T11:40:00.000Z";
  item.expiresAt = "2026-11-16T11:45:00.000Z";
  const result = verifySignedBootstrapApproval(
    envelope(item), expected, trusted
  );
  disabled(result);
  assert.equal(result.status, "APPROVAL_TIME_INVALID");
});

test("future-dated signed approval is rejected", () => {
  const item = claims();
  item.issuedAt = "2026-11-16T12:01:00.000Z";
  item.expiresAt = "2026-11-16T12:06:00.000Z";
  const result = verifySignedBootstrapApproval(
    envelope(item), expected, trusted
  );
  disabled(result);
  assert.equal(result.status, "APPROVAL_TIME_INVALID");
});

test("approval longer than 15 minutes is rejected", () => {
  const item = claims();
  item.expiresAt = "2026-11-16T12:20:00.000Z";
  const result = verifySignedBootstrapApproval(
    envelope(item), expected, trusted
  );
  disabled(result);
  assert.equal(result.status, "APPROVAL_TIME_INVALID");
});

test("alternate signing key is rejected", () => {
  const alternate = generateKeyPairSync("ed25519");
  const item = envelope();
  item.signature = sign(
    null,
    Buffer.from(item.payload, "utf8"),
    alternate.privateKey
  ).toString("base64");

  const result = verifySignedBootstrapApproval(
    item, expected, trusted
  );
  disabled(result);
  assert.equal(result.status, "SIGNATURE_INVALID");
});