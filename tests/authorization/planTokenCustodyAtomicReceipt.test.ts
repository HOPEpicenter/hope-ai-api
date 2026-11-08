import assert from "node:assert/strict";
import {
  planTokenCustodyAtomicReceipt,
} from "../../src/services/authorization/planTokenCustodyAtomicReceipt";

import {
  TOKEN_CUSTODY_PARTITION_KEY,
} from "../../src/repositories/tokenCustodyMetadataRepository";

const receiptId = "123e4567-e89b-42d3-a456-426614174000";

const snapshot = {
  recordId: "synthetic-credential-1",
  revision: 3,
  rotationRevision: 2,
  revocationRevision: 0,
  state: "active" as const,
  accessExpiresAtMs: 1000,
};

const command = {
  action: "rotate" as const,
  expectedRevision: 3,
  expectedRotationRevision: 2,
  expectedRevocationRevision: 0,
  authorized: true,
  executionEnabled: true,
  nextAccessExpiresAtMs: 2000,
};

const valid = {
  recordId: snapshot.recordId,
  etag: 'W/"synthetic-etag"',
  receiptId,
  snapshot,
  command,
};

function test(name: string, run: () => void): void {
  run();
  console.log(`PASS ${name}`);
}

test("proposes exactly two same-partition actions", () => {
  const result = planTokenCustodyAtomicReceipt(valid);
  assert.equal(result.outcome, "proposed");

  if (result.outcome !== "proposed") return;

  assert.equal(result.actions.length, 2);
  assert.equal(result.actions[0].kind, "update");
  assert.equal(result.actions[1].kind, "create");

  assert.equal(
    result.actions[0].partitionKey,
    TOKEN_CUSTODY_PARTITION_KEY,
  );
  assert.equal(
    result.actions[1].partitionKey,
    TOKEN_CUSTODY_PARTITION_KEY,
  );
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
});

test("proposes a conditional metadata replacement", () => {
  const result = planTokenCustodyAtomicReceipt(valid);
  assert.equal(result.outcome, "proposed");

  if (result.outcome !== "proposed") return;

  const action = result.actions[0];
  assert.equal(action.kind, "update");

  if (action.kind !== "update") return;

  assert.equal(action.etag, valid.etag);
  assert.equal(action.mode, "Replace");
  assert.equal(action.rowKey, snapshot.recordId);

  const updated = JSON.parse(action.snapshotJson);
  assert.equal(updated.revision, 4);
  assert.equal(updated.rotationRevision, 3);
  assert.equal(updated.accessExpiresAtMs, 2000);
});

test("creates deterministic metadata-only audit receipt", () => {
  const result = planTokenCustodyAtomicReceipt(valid);
  assert.equal(result.outcome, "proposed");

  if (result.outcome !== "proposed") return;

  const action = result.actions[1];
  assert.equal(action.kind, "create");

  if (action.kind !== "create") return;

  assert.equal(action.rowKey, `audit-${receiptId}`);

  const receipt = JSON.parse(action.receiptJson);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.action, "rotate");
  assert.equal(receipt.previousRevision, 3);
  assert.equal(receipt.nextRevision, 4);
  assert.equal(Object.keys(receipt).length, 6);
});

test("denies disabled execution precondition", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: { ...command, executionEnabled: false },
  });

  assert.equal(result.outcome, "denied");
});

test("denies unauthorized synthetic command", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: { ...command, authorized: false },
  });

  assert.equal(result.outcome, "denied");
});

test("denies wildcard etag", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    etag: "*",
  });

  assert.equal(result.outcome, "denied");
});

test("denies blank etag", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    etag: " ",
  });

  assert.equal(result.outcome, "denied");
});

test("denies stale revision", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: { ...command, expectedRevision: 2 },
  });

  assert.equal(result.outcome, "denied");
});

test("denies revoked custody", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    snapshot: { ...snapshot, state: "revoked" },
  });

  assert.equal(result.outcome, "denied");
});

test("denies record mismatch", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    recordId: "different-record",
  });

  assert.equal(result.outcome, "denied");
});

test("denies malformed receipt id", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    receiptId: "../bad",
  });

  assert.equal(result.outcome, "denied");
});

test("denies unexpected command properties", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: ({
      ...command,
      refreshToken: "synthetic-secret-must-not-persist",
    } as unknown as typeof command),
  });

  assert.equal(result.outcome, "denied");
});

test("supports proposed revocation without execution", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: {
      action: "revoke",
      expectedRevision: 3,
      expectedRotationRevision: 2,
      expectedRevocationRevision: 0,
      authorized: true,
      executionEnabled: true,
    },
  });

  assert.equal(result.outcome, "proposed");

  if (result.outcome !== "proposed") return;

  const update = result.actions[0];
  assert.equal(update.kind, "update");

  if (update.kind !== "update") return;

  assert.equal(JSON.parse(update.snapshotJson).state, "revoked");
  assert.equal(result.executionPermitted, false);
});

test("denies uncertain custody state", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    snapshot: { ...snapshot, state: "uncertain" },
  });

  assert.equal(result.outcome, "denied");
});

test("denies stale rotation revision", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    command: { ...command, expectedRotationRevision: 1 },
  });

  assert.equal(result.outcome, "denied");
});

test("denies revision overflow", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    snapshot: {
      ...snapshot,
      revision: Number.MAX_SAFE_INTEGER,
    },
    command: {
      ...command,
      expectedRevision: Number.MAX_SAFE_INTEGER,
    },
  });

  assert.equal(result.outcome, "denied");
});

test("denies injected credential field in snapshot", () => {
  const result = planTokenCustodyAtomicReceipt({
    ...valid,
    snapshot: ({
      ...snapshot,
      refreshToken: "synthetic-never-persist",
    } as unknown as typeof snapshot),
  });

  assert.equal(result.outcome, "denied");
});

test("denies unexpected top-level credential field", () => {
  const input = ({
    ...valid,
    encryptedCredential: "synthetic-never-persist",
  } as unknown as typeof valid);

  const result = planTokenCustodyAtomicReceipt(input);

  assert.equal(result.outcome, "denied");
});

test("produces deterministic matching receipt and revision", () => {
  const first = planTokenCustodyAtomicReceipt(valid);
  const second = planTokenCustodyAtomicReceipt(valid);

  assert.equal(first.outcome, "proposed");
  assert.deepEqual(first, second);

  if (first.outcome !== "proposed") return;

  const update = first.actions[0];
  const audit = first.actions[1];

  assert.equal(update.kind, "update");
  assert.equal(audit.kind, "create");

  if (update.kind !== "update" ||
      audit.kind !== "create") return;

  const next = JSON.parse(update.snapshotJson);
  const receipt = JSON.parse(audit.receiptJson);

  assert.equal(receipt.recordId, next.recordId);
  assert.equal(receipt.nextRevision, next.revision);
  assert.equal(receipt.previousRevision + 1, next.revision);
  assert.equal(update.partitionKey, audit.partitionKey);

  assert.equal(first.executionPermitted, false);
  assert.equal(first.retryPermitted, false);
});

console.log("ATOMIC_CUSTODY_PLANNER_TESTS=19_OF_19_PASS");
