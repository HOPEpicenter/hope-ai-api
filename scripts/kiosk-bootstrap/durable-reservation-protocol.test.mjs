import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReservationStorageContract,
  classifyReservationWrite,
  reconcileReservation
} from "./durable-reservation-protocol.mjs";

const valid = () => ({
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  objectId: "11111111-2222-4333-8444-555555555555",
  staffId: "synthetic_staff",
  operationId: "synthetic_operation",
  existingBindingAbsentVerified: true
});

function disabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.durableCommitVerified, false);
  assert.equal(result.crossPartitionAtomicityProven, false);
}

test("valid request produces insert-only descriptor", () => {
  const result = buildReservationStorageContract(valid());
  disabled(result);
  assert.equal(result.command.operation, "createEntity");
  assert.equal(result.command.intent, "INSERT_IF_ABSENT");
  assert.equal(result.command.overwritePermitted, false);
  assert.equal(result.command.upsertPermitted, false);
  assert.equal(result.command.deletePermitted, false);
});

test("invalid identity does not produce a command", () => {
  const result = buildReservationStorageContract({
    ...valid(),
    objectId: "invalid"
  });
  disabled(result);
  assert.equal(result.command, null);
});

test("missing binding evidence does not produce a command", () => {
  const result = buildReservationStorageContract({
    ...valid(),
    existingBindingAbsentVerified: false
  });
  disabled(result);
  assert.equal(result.command, null);
});

test("claimed write success never grants authority", () => {
  const result = classifyReservationWrite({
    kind: "CREATED"
  });
  disabled(result);
  assert.equal(
    result.status,
    "CREATE_ACKNOWLEDGED_VERIFY_READ_ONLY"
  );
});

test("storage conflict requires reconciliation", () => {
  const result = classifyReservationWrite({
    kind: "CONFLICT"
  });
  disabled(result);
  assert.equal(
    result.status,
    "RESERVATION_CONFLICT_RECONCILE"
  );
});

test("unknown write outcome cannot be retried", () => {
  const result = classifyReservationWrite({
    kind: "TIMEOUT"
  });
  disabled(result);
  assert.equal(
    result.status,
    "WRITE_OUTCOME_UNKNOWN_RECONCILE"
  );
});

test("missing reservation remains stopped", () => {
  const contract = buildReservationStorageContract(valid());
  const result = reconcileReservation(contract, {
    kind: "NOT_FOUND"
  });
  disabled(result);
  assert.equal(result.status, "RESERVATION_NOT_FOUND_STOP");
});

test("wrong Staff owner cannot reconcile", () => {
  const contract = buildReservationStorageContract(valid());
  const result = reconcileReservation(contract, {
    kind: "FOUND",
    entity: {
      ...contract.command.entity,
      staffId: "different_staff"
    }
  });
  disabled(result);
  assert.equal(result.status, "RESERVATION_MISMATCH_STOP");
});

test("wrong operation cannot reconcile", () => {
  const contract = buildReservationStorageContract(valid());
  const result = reconcileReservation(contract, {
    kind: "FOUND",
    entity: {
      ...contract.command.entity,
      operationId: "different_operation"
    }
  });
  disabled(result);
  assert.equal(result.status, "RESERVATION_MISMATCH_STOP");
});

test("matching read-only result still denies execution", () => {
  const contract = buildReservationStorageContract(valid());
  const result = reconcileReservation(contract, {
    kind: "FOUND",
    entity: { ...contract.command.entity }
  });
  disabled(result);
  assert.equal(
    result.status,
    "RESERVATION_MATCHES_READ_ONLY"
  );
});

test("unknown read result remains stopped", () => {
  const contract = buildReservationStorageContract(valid());
  const result = reconcileReservation(contract, {
    kind: "ERROR"
  });
  disabled(result);
  assert.equal(
    result.status,
    "READ_OUTCOME_UNKNOWN_RECONCILE"
  );
});