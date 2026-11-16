import test from "node:test";
import assert from "node:assert/strict";

import {
  createKioskReservationTableAdapter
} from "./azure-table-reservation-adapter.mjs";

import {
  buildReservationStorageContract
} from "./durable-reservation-protocol.mjs";

const input = () => ({
  tenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  objectId: "11111111-2222-4333-8444-555555555555",
  staffId: "synthetic_staff",
  operationId: "synthetic_operation",
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

test("missing read-only Table port is rejected", () => {
  assert.throws(
    () => createKioskReservationTableAdapter({}),
    /READ_ONLY_TABLE_PORT_REQUIRED/
  );
});

test("matching Table entity reconciles read-only", async () => {
  const contract = buildReservationStorageContract(input());
  let reads = 0;

  const adapter = createKioskReservationTableAdapter({
    async getEntity(partitionKey, rowKey) {
      reads++;
      assert.equal(
        partitionKey,
        contract.command.entity.partitionKey
      );
      assert.equal(rowKey, contract.command.entity.rowKey);
      return { ...contract.command.entity };
    }
  });

  const result = await adapter.inspect(input());
  assertDenied(result);
  assert.equal(result.status, "RESERVATION_MATCHES_READ_ONLY");
  assert.equal(reads, 1);
});

test("404 remains stopped and does not write", async () => {
  let writes = 0;
  const adapter = createKioskReservationTableAdapter({
    async getEntity() {
      throw { statusCode: 404 };
    },
    async createEntity() {
      writes++;
    }
  });

  const result = await adapter.inspect(input());
  assertDenied(result);
  assert.equal(result.status, "RESERVATION_NOT_FOUND_STOP");
  assert.equal(writes, 0);
});

test("mismatched owner is rejected", async () => {
  const contract = buildReservationStorageContract(input());

  const adapter = createKioskReservationTableAdapter({
    async getEntity() {
      return {
        ...contract.command.entity,
        staffId: "another_staff"
      };
    }
  });

  const result = await adapter.inspect(input());
  assertDenied(result);
  assert.equal(result.status, "RESERVATION_MISMATCH_STOP");
});

test("storage failure remains unknown", async () => {
  const adapter = createKioskReservationTableAdapter({
    async getEntity() {
      throw new Error("synthetic network failure");
    }
  });

  const result = await adapter.inspect(input());
  assertDenied(result);
  assert.equal(
    result.status,
    "READ_OUTCOME_UNKNOWN_RECONCILE"
  );
});

test("invalid identity never reaches storage", async () => {
  let reads = 0;

  const adapter = createKioskReservationTableAdapter({
    async getEntity() {
      reads++;
      return {};
    }
  });

  const result = await adapter.inspect({
    ...input(),
    objectId: "invalid"
  });

  assertDenied(result);
  assert.equal(result.status, "INVALID_RESERVATION_PLAN");
  assert.equal(reads, 0);
});

test("all write methods remain disabled", async () => {
  let writes = 0;

  const adapter = createKioskReservationTableAdapter({
    async getEntity() {
      throw { statusCode: 404 };
    },
    async createEntity() { writes++; },
    async upsertEntity() { writes++; },
    async updateEntity() { writes++; },
    async deleteEntity() { writes++; }
  });

  for (const action of ["reserve", "update", "remove"]) {
    const result = await adapter[action]({
      ...input(),
      force: true,
      ownerApproved: true
    });

    assertDenied(result);
    assert.equal(result.status, "WRITE_DISABLED");
  }

  assert.equal(writes, 0);
});

test("adapter exposes no executable writer capability", () => {
  const adapter = createKioskReservationTableAdapter({
    async getEntity() { return {}; }
  });

  assert.equal(adapter.createEntity, undefined);
  assert.equal(adapter.submitTransaction, undefined);
  assert.equal(Object.isFrozen(adapter), true);
});