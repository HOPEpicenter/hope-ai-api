import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessPhaseCIssuerCredentialShape
} from "../../src/services/authorization/assessPhaseCIssuerCredentialShape";

const NOW = 1800000000;

const valid = {
  iss: "trusted-issuer",
  aud: "protected-consumer",
  iat: NOW,
  exp: NOW + 120,
  jti: "11111111-1111-4111-8111-111111111111",
  operationId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  resourceScope: "/subscriptions/approved/resource",
  runbookName: "approved-operation-aware-runbook",
  approvalProvenance: "synthetic-untrusted-reference",
  oneTimeUse: true
};

function assess(input: unknown) {
  return assessPhaseCIssuerCredentialShape(input, NOW);
}

test("valid shape never authorizes issuance or execution", () => {
  assert.deepEqual(assess(valid), {
    status: "valid_shape_only",
    issuanceAuthorized: false,
    executionAuthorized: false,
    retryAuthorized: false
  });
});

test("rejects missing or injected claims", () => {
  assert.equal(
    assess({ ...valid, arbitrary: "injected" }).status,
    "invalid"
  );

  const { approvalProvenance, ...missing } = valid;

  assert.equal(assess(missing).status, "invalid");
});

test("rejects duplicate binding identifiers", () => {
  assert.equal(
    assess({ ...valid, requestId: valid.operationId }).status,
    "invalid"
  );

  assert.equal(
    assess({ ...valid, jti: valid.operationId }).status,
    "invalid"
  );
});

test("rejects noncanonical identifiers", () => {
  assert.equal(
    assess({ ...valid, operationId: "not-a-uuid" }).status,
    "invalid"
  );
});

test("rejects invalid credential lifetime", () => {
  assert.equal(
    assess({ ...valid, exp: NOW + 301 }).status,
    "invalid"
  );

  assert.equal(
    assess({ ...valid, exp: NOW }).status,
    "invalid"
  );

  assert.equal(
    assess({ ...valid, iat: NOW + 1 }).status,
    "invalid"
  );
});

test("rejects missing one-time requirement", () => {
  assert.equal(
    assess({ ...valid, oneTimeUse: false }).status,
    "invalid"
  );
});

test("rejects blank operation bindings", () => {
  assert.equal(
    assess({ ...valid, resourceScope: "" }).status,
    "invalid"
  );

  assert.equal(
    assess({ ...valid, runbookName: " " }).status,
    "invalid"
  );
});

test("does not accept caller approval as authority", () => {
  const result = assess({
    ...valid,
    approvalProvenance: "caller-claims-approved"
  });

  assert.equal(result.status, "valid_shape_only");
  assert.equal(result.issuanceAuthorized, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("rejects invalid time source", () => {
  assert.equal(
    assessPhaseCIssuerCredentialShape(valid, Number.NaN).status,
    "invalid"
  );
});