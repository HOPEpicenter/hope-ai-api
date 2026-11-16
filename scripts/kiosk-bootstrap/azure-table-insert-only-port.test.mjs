import test from "node:test";
import assert from "node:assert/strict";

import {
  createKioskInsertOnlyPort
} from "./azure-table-insert-only-port.mjs";

import {
  buildReservationStorageContract
} from "./durable-reservation-protocol.mjs";

const input = () => ({
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  objectId: "11111111-2222-4333-8444-555555555555",
  staffId: "synthetic_staff_a",
  operationId: "synthetic_operation_a",
  existingBindingAbsentVerified: true
});

function assertDenied(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.durableCommitVerified, false);
  assert.equal(result.crossPartitionAtomicityProven, false);
}

test("missing create-only Table port is rejected", () => {
  assert.throws(
    () => createKioskInsertOnlyPort({}),
    /CREATE_ONLY_TABLE_PORT_REQUIRED/
  );
});

test("first insert uses createEntity exactly once", async () => {
  let calls = 0;
  const contract = buildReservationStorageContract(input());

  const port = createKioskInsertOnlyPort({
    async createEntity(entity) {
      calls++;
      assert.deepEqual(entity, contract.command.entity);
    }
  });

  const result = await port.insert(input());
  assertDenied(result);
  assert.equal(calls, 1);
  assert.equal(
    result.status,
    "CREATE_ACKNOWLEDGED_VERIFY_READ_ONLY"
  );
});

test("duplicate insert receives conflict and stops", async () => {
  const rows = new Set();
  let calls = 0;

  const port = createKioskInsertOnlyPort({
    async createEntity(entity) {
      calls++;
      const key = `${entity.partitionKey}:${entity.rowKey}`;

      if (rows.has(key)) {
        throw { statusCode: 409 };
      }

      rows.add(key);
    }
  });

  const first = await port.insert(input());
  const second = await port.insert(input());

  assertDenied(first);
  assertDenied(second);
  assert.equal(calls, 2);
  assert.equal(
    second.status,
    "RESERVATION_CONFLICT_RECONCILE"
  );
});

test("different Staff cannot claim same identity", async () => {
  const rows = new Set();

  const port = createKioskInsertOnlyPort({
    async createEntity(entity) {
      const key = `${entity.partitionKey}:${entity.rowKey}`;

      if (rows.has(key)) {
        throw { statusCode: 409 };
      }

      rows.add(key);
    }
  });

  await port.insert(input());

  const second = await port.insert({
    ...input(),
    staffId: "synthetic_staff_b",
    operationId: "synthetic_operation_b"
  });

  assertDenied(second);
  assert.equal(
    second.status,
    "RESERVATION_CONFLICT_RECONCILE"
  );
});

test("precondition conflict 412 also stops", async () => {
  let calls = 0;

  const port = createKioskInsertOnlyPort({
    async createEntity() {
      calls++;
      throw { statusCode: 412 };
    }
  });

  const result = await port.insert(input());

  assertDenied(result);
  assert.equal(calls, 1);
  assert.equal(
    result.status,
    "RESERVATION_CONFLICT_RECONCILE"
  );
});

test("lost acknowledgment never triggers retry", async () => {
  let calls = 0;

  const port = createKioskInsertOnlyPort({
    async createEntity() {
      calls++;
      throw new Error("synthetic lost acknowledgment");
    }
  });

  const result = await port.insert(input());

  assertDenied(result);
  assert.equal(calls, 1);
  assert.equal(
    result.status,
    "WRITE_OUTCOME_UNKNOWN_RECONCILE"
  );
});

test("invalid identity cannot reach storage", async () => {
  let calls = 0;

  const port = createKioskInsertOnlyPort({
    async createEntity() {
      calls++;
    }
  });

  const result = await port.insert({
    ...input(),
    objectId: "invalid"
  });

  assertDenied(result);
  assert.equal(calls, 0);
  assert.equal(
    result.status,
    "WRITE_OUTCOME_UNKNOWN_RECONCILE"
  );
});

test("port exposes no update, delete, or upsert API", () => {
  const port = createKioskInsertOnlyPort({
    async createEntity() {}
  });

  assert.equal(port.update, undefined);
  assert.equal(port.remove, undefined);
  assert.equal(port.upsert, undefined);
  assert.equal(port.submitTransaction, undefined);
  assert.equal(Object.isFrozen(port), true);
});