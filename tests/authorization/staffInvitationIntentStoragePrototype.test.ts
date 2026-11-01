import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  STAFF_INVITATION_INTENT_PARTITION,
  STAFF_INVITATION_INTENT_STORAGE_SOURCE,
  StaffInvitationIntentStoragePrototypeRepository
} from "../../src/repositories/staffInvitationIntentStoragePrototypeRepository";

const intent = {
  schemaVersion: 1,
  sourceIdentity: "staff-invitation-intent-v1",
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorId: "synthetic-admin",
  displayName: "Synthetic Staff",
  recipientEmail: "synthetic@example.org",
  createdAt: "2026-11-01T00:00:00.000Z"
};

type Row = Record<string, unknown>;

const rows = new Map<string, Row>();
let createCount = 0;
let readCount = 0;
let failWrite: number | "unknown" | null = null;
let failRead: number | "unknown" | null = null;

function storageError(code: number | "unknown"): Error {
  const error = new Error("synthetic storage failure");
  if (typeof code === "number") {
    Object.assign(error, { statusCode: code });
  }
  return error;
}

const fake = {
  async createEntity(row: Row): Promise<void> {
    createCount++;
    if (failWrite !== null) throw storageError(failWrite);

    const key = `${row.partitionKey}/${row.rowKey}`;
    if (rows.has(key)) throw storageError(409);
    rows.set(key, { ...row });
  },

  async getEntity(partitionKey: string, rowKey: string): Promise<Row> {
    readCount++;
    if (failRead !== null) throw storageError(failRead);

    const row = rows.get(`${partitionKey}/${rowKey}`);
    if (!row) throw storageError(404);
    return { ...row };
  }
};

const repository = new StaffInvitationIntentStoragePrototypeRepository(
  fake as unknown as Pick<TableClient, "createEntity" | "getEntity">
);

function safe(value: {
  authoritative: boolean;
  executionPermitted: boolean;
  retryPermitted: boolean;
  automaticRecoveryPermitted: boolean;
  graphOutcomeVerified: boolean;
  productionRolloutPermitted: boolean;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.graphOutcomeVerified, false);
  assert.equal(value.productionRolloutPermitted, false);
  assert.ok(Object.isFrozen(value));
}

async function main(): Promise<void> {
  const invalid = await repository.recordIntent({
    ...intent, operationId: "not-a-guid"
  });
  assert.equal(invalid.status, "invalid_input");
  safe(invalid);
  assert.equal(createCount, 0);
  console.log("PASS invalid input causes zero writes");

  const missing = await repository.inspectIntent(intent);
  assert.equal(missing.status, "missing");
  safe(missing);

  const first = await repository.recordIntent(intent);
  assert.equal(first.status, "recorded_unverified");
  safe(first);
  assert.equal(rows.size, 1);

  const [key, persisted] = Array.from(rows.entries())[0];
  assert.equal(persisted.partitionKey, STAFF_INVITATION_INTENT_PARTITION);
  assert.equal(persisted.source, STAFF_INVITATION_INTENT_STORAGE_SOURCE);
  assert.ok(String(persisted.rowKey).includes(intent.operationId));
  assert.ok(!key.includes(intent.recipientEmail));
  assert.ok(!key.includes(intent.displayName));
  console.log("PASS single create-only operation-keyed record");

  const duplicate = await repository.recordIntent({ ...intent });
  assert.equal(duplicate.status, "conflict");
  safe(duplicate);
  assert.equal(rows.size, 1);

  const changed = await repository.recordIntent({
    ...intent, recipientEmail: "other@example.org"
  });
  assert.equal(changed.status, "conflict");
  safe(changed);

  const matching = await repository.inspectIntent(intent);
  assert.equal(matching.status, "matching_evidence");
  safe(matching);

  const contradiction = await repository.inspectIntent({
    ...intent, actorId: "different-synthetic-actor"
  });
  assert.equal(contradiction.status, "contradictory");
  safe(contradiction);

  const original = rows.get(key)!;
  rows.set(key, { ...original, source: "untrusted-source" });
  const metadataConflict = await repository.inspectIntent(intent);
  assert.equal(metadataConflict.status, "contradictory");
  safe(metadataConflict);
  rows.set(key, original);

  rows.set(key, { ...original, intentJson: '{"broken":true}' });
  const payloadConflict = await repository.inspectIntent(intent);
  assert.equal(payloadConflict.status, "contradictory");
  safe(payloadConflict);
  rows.set(key, original);

  failWrite = "unknown";
  const uncertain = await repository.recordIntent({
    ...intent,
    operationId: "a8f20139-bbd7-4d1f-8ceb-3a183113e84d"
  });
  assert.equal(uncertain.status, "uncertain");
  safe(uncertain);
  failWrite = null;
  console.log("PASS ambiguous writes remain uncertain");

  failRead = "unknown";
  const unavailable = await repository.inspectIntent(intent);
  assert.equal(unavailable.status, "unavailable");
  safe(unavailable);
  failRead = null;

  const before = readCount;
  const invalidRead = await repository.inspectIntent({
    ...intent, schemaVersion: 2
  });
  assert.equal(invalidRead.status, "invalid_input");
  safe(invalidRead);
  assert.equal(readCount, before);
  console.log("PASS invalid reads perform zero storage operations");

  assert.ok(createCount > 0);
  assert.ok(readCount > 0);
  console.log("Staff invitation intent storage synthetic tests passed");
}

main().catch(() => {
  console.error("Synthetic persistence test failed");
  process.exitCode = 1;
});
