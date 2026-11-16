import test from "node:test";
import assert from "node:assert/strict";
import {
  planBindingReservation,
  RESERVATION_PARTITION
} from "./plan-binding-reservation.mjs";

const valid = () => ({
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  objectId: "11111111-2222-4333-8444-555555555555",
  staffId: "staff_test_a",
  operationId: "operation_test_a",
  existingBindingAbsentVerified: true
});

function denied(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.crossPartitionAtomicityProven, false);
}

test("missing input fails closed", () => {
  const result = planBindingReservation();
  denied(result);
  assert.equal(result.plan, null);
});

test("wrong tenant fails closed", () => {
  const result = planBindingReservation({
    ...valid(),
    tenantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  });
  denied(result);
  assert.equal(result.plan, null);
});

test("invalid object ID fails closed", () => {
  const result = planBindingReservation({
    ...valid(),
    objectId: "invalid"
  });
  denied(result);
  assert.equal(result.plan, null);
});

test("unknown binding state fails closed", () => {
  const result = planBindingReservation({
    ...valid(),
    existingBindingAbsentVerified: false
  });
  denied(result);
  assert.equal(result.plan, null);
});

test("invalid operation identifier fails closed", () => {
  const result = planBindingReservation({
    ...valid(),
    operationId: "../unsafe"
  });
  denied(result);
  assert.equal(result.plan, null);
});

test("same identity produces same ownership key", () => {
  const first = planBindingReservation(valid());
  const second = planBindingReservation({
    ...valid(),
    staffId: "staff_test_b",
    operationId: "operation_test_b"
  });

  denied(first);
  denied(second);
  assert.equal(first.plan.rowKey, second.plan.rowKey);
  assert.equal(first.plan.partitionKey, RESERVATION_PARTITION);
  assert.equal(first.plan.storageIntent, "CONDITIONAL_CREATE_ONLY");
});

test("different identities produce different keys", () => {
  const first = planBindingReservation(valid());
  const second = planBindingReservation({
    ...valid(),
    objectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  });

  denied(first);
  denied(second);
  assert.notEqual(first.plan.rowKey, second.plan.rowKey);
});

test("normalization preserves identity-key stability", () => {
  const first = planBindingReservation(valid());
  const second = planBindingReservation({
    ...valid(),
    objectId: valid().objectId.toUpperCase()
  });

  denied(first);
  denied(second);
  assert.equal(first.plan.rowKey, second.plan.rowKey);
});

test("fully claimed readiness still denies execution", () => {
  const result = planBindingReservation({
    ...valid(),
    ownerApproved: true,
    executionPermitted: true,
    force: true
  });

  denied(result);
  assert.equal(
    result.status,
    "DESIGN_ONLY_EXECUTION_DISABLED"
  );
  assert.equal(
    result.plan.uncertainOutcomeDisposition,
    "STOP_AND_RECONCILE"
  );
  assert.equal(result.plan.crossPartitionCommit, "NOT_ATOMIC");
});