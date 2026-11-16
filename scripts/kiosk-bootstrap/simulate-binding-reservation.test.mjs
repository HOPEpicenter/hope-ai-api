import test from "node:test";
import assert from "node:assert/strict";
import {
  SimulatedBindingReservation
} from "./simulate-binding-reservation.mjs";

const valid = () => ({
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  objectId: "11111111-2222-4333-8444-555555555555",
  staffId: "synthetic_staff_a",
  operationId: "synthetic_operation_a",
  existingBindingAbsentVerified: true
});

function remainsDisabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.crossPartitionAtomicityProven, false);
}

test("first synthetic reservation is inserted", () => {
  const store = new SimulatedBindingReservation();
  const result = store.reserve(valid());
  remainsDisabled(result);
  assert.equal(result.status, "SIMULATED_RESERVATION_INSERTED");
});

test("duplicate same-operation insertion is denied", () => {
  const store = new SimulatedBindingReservation();
  store.reserve(valid());
  const result = store.reserve(valid());
  remainsDisabled(result);
  assert.equal(result.status, "ALREADY_RESERVED_OR_REPLAY");
});

test("different Staff ID cannot claim same identity", () => {
  const store = new SimulatedBindingReservation();
  store.reserve(valid());
  const result = store.reserve({
    ...valid(),
    staffId: "synthetic_staff_b",
    operationId: "synthetic_operation_b"
  });
  remainsDisabled(result);
  assert.equal(result.status, "ALREADY_RESERVED_OR_REPLAY");
});

test("different identity may have separate reservation", () => {
  const store = new SimulatedBindingReservation();
  const first = store.reserve(valid());
  const second = store.reserve({
    ...valid(),
    objectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    staffId: "synthetic_staff_b",
    operationId: "synthetic_operation_b"
  });
  remainsDisabled(first);
  remainsDisabled(second);
  assert.equal(second.status, "SIMULATED_RESERVATION_INSERTED");
});

test("lost acknowledgment never permits automatic retry", () => {
  const store = new SimulatedBindingReservation();
  const result = store.reserve(valid(), {
    simulateLostAcknowledgment: true
  });
  remainsDisabled(result);
  assert.equal(
    result.status,
    "OUTCOME_UNCERTAIN_STOP_AND_RECONCILE"
  );
  assert.equal(
    store.reserve(valid()).status,
    "ALREADY_RESERVED_OR_REPLAY"
  );
});

test("read-only reconciliation finds exact reservation", () => {
  const store = new SimulatedBindingReservation();
  store.reserve(valid());
  const result = store.inspect(valid());
  remainsDisabled(result);
  assert.equal(result.status, "RESERVATION_FOUND_READ_ONLY");
});

test("read-only reconciliation rejects wrong owner", () => {
  const store = new SimulatedBindingReservation();
  store.reserve(valid());
  const result = store.inspect({
    ...valid(),
    staffId: "synthetic_staff_b"
  });
  remainsDisabled(result);
  assert.equal(result.status, "RESERVATION_OWNER_MISMATCH");
});

test("invalid identity cannot reserve", () => {
  const store = new SimulatedBindingReservation();
  const result = store.reserve({
    ...valid(),
    objectId: "not-a-guid"
  });
  remainsDisabled(result);
  assert.equal(result.status, "INVALID_RESERVATION_PLAN");
});

test("unknown binding state cannot reserve", () => {
  const store = new SimulatedBindingReservation();
  const result = store.reserve({
    ...valid(),
    existingBindingAbsentVerified: false
  });
  remainsDisabled(result);
  assert.equal(result.status, "INVALID_RESERVATION_PLAN");
});