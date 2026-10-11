import assert from "node:assert/strict";

import {
  isOAuthExecutionFenceRecordV1,
  inspectOAuthExecutionFenceV1
} from "../../src/contracts/oauthExecutionFence.v1";

const CLAIMED = "2026-01-01T12:00:00.000Z";
const EXPIRES = "2026-01-01T12:05:00.000Z";
const RESOLVED = "2026-01-01T12:02:00.000Z";

const record = {
  schemaVersion: 1,
  fenceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  credentialId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sessionBindingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  operation: "credential_read",
  state: "claimed",
  fencingRevision: 1,
  expectedSessionRevision: 4,
  expectedCredentialRevision: 7,
  claimedAt: CLAIMED,
  expiresAt: EXPIRES,
  resolvedAt: null
};

function reject(value: unknown): void {
  assert.equal(isOAuthExecutionFenceRecordV1(value), false);
  assert.deepEqual(inspectOAuthExecutionFenceV1(value), {
    recognized: false,
    executionPermitted: false,
    requiresAtomicCoordination: true
  });
}

function acceptWithoutExecution(value: unknown): void {
  assert.equal(isOAuthExecutionFenceRecordV1(value), true);
  assert.deepEqual(inspectOAuthExecutionFenceV1(value), {
    recognized: true,
    executionPermitted: false,
    requiresAtomicCoordination: true
  });
}

function main(): void {
  acceptWithoutExecution(record);

  for (const state of [
    "completed", "cancelled", "uncertain"
  ] as const) {
    acceptWithoutExecution({
      ...record,
      state,
      resolvedAt: RESOLVED
    });
  }

  for (const operation of [
    "credential_read",
    "credential_rotate",
    "credential_revoke"
  ] as const) {
    acceptWithoutExecution({
      ...record,
      operation
    });
  }

  // No V1 downgrade, missing bindings or extra fields.
  reject({ ...record, schemaVersion: 2 });
  reject({ ...record, credentialId: undefined });
  reject({ ...record, sessionBindingId: undefined });
  reject({ ...record, additionalAuthority: true });
  reject(null);
  reject({ authorized: true });
  reject({ readyForAtomicFence: true });

  // Strict lifecycle and timestamp consistency.
  reject({ ...record, state: "unknown" });
  reject({ ...record, state: "completed" });
  reject({ ...record, state: "uncertain" });
  reject({ ...record, state: "cancelled" });
  reject({ ...record, resolvedAt: RESOLVED });
  reject({ ...record, claimedAt: EXPIRES });
  reject({ ...record, expiresAt: CLAIMED });
  reject({ ...record, claimedAt: "invalid" });
  reject({
    ...record,
    state: "completed",
    resolvedAt: "2025-12-31T12:00:00.000Z"
  });

  // Fence revisions are not caller authorization.
  reject({ ...record, fencingRevision: -1 });
  reject({ ...record, fencingRevision: Number.NaN });
  reject({ ...record, expectedSessionRevision: -1 });
  reject({
    ...record,
    expectedCredentialRevision: Number.MAX_SAFE_INTEGER
  });

  // Cross-record races are NOT solved by a valid snapshot.
  // Even a structurally valid claimed fence stays non-executable.
  const beforeRevocation = { ...record };
  const afterRevocation = {
    ...record,
    state: "uncertain",
    resolvedAt: RESOLVED
  };

  acceptWithoutExecution(beforeRevocation);
  acceptWithoutExecution(afterRevocation);

  // Expiration alone cannot prove external execution stopped.
  acceptWithoutExecution({
    ...record,
    state: "claimed",
    expiresAt: "2026-01-01T12:01:00.000Z"
  });

  console.log(
    "OAuth execution fence V1 non-executing contract tests passed"
  );
}

main();
