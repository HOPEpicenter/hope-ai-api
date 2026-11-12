import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import {
  submitStaffScopedAtomicDeactivation,
  type StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

const event = {
  eventId: "evt-scoped-1",
  staffId: "synthetic-staff-1",
  type: "staff.deactivated" as const,
  occurredAt: "2026-11-09T12:00:00.000Z",
  actorId: "synthetic-admin",
  data: { status: "inactive" as const }
};

function fixture() {
  let reads = 0;
  let submissions = 0;
  let actions: TransactionAction[] = [];

  const port: StaffScopedAtomicPort = {
    async getEntity(partitionKey, rowKey) {
      reads++;
      assert.equal(partitionKey, event.staffId);
      assert.equal(rowKey, STAFF_SECURITY_METADATA_HEAD);

      return {
        partitionKey: event.staffId,
        rowKey: STAFF_SECURITY_METADATA_HEAD,
        state: "active",
        revision: 0,
        authorizationRevision: 0,
        etag: 'W/"synthetic-etag"'
      };
    },
    async submitTransaction(value) {
      submissions++;
      actions = value;
    }
  };

  return {
    port,
    get reads() { return reads; },
    get submissions() { return submissions; },
    get actions() { return actions; }
  };
}

async function main(): Promise<void> {
  const disabled = fixture();

  const denied = await submitStaffScopedAtomicDeactivation(
    event, disabled.port
  );

  assert.equal(denied.status, "denied");
  assert.equal(disabled.reads, 0);
  assert.equal(disabled.submissions, 0);
  console.log("[PASS] Default disabled; zero storage access");

  const invalid = fixture();
  assert.equal(
    (await submitStaffScopedAtomicDeactivation(
      { ...event, data: { status: "active" } },
      invalid.port,
      true
    )).status,
    "denied"
  );
  assert.equal(invalid.reads, 0);
  console.log("[PASS] Invalid mutation denied before storage");

  const scoped = fixture();
  const committed = await submitStaffScopedAtomicDeactivation(
    event, scoped.port, true
  );

  assert.equal(committed.status, "committed");
  assert.equal(committed.executionPermitted, false);
  assert.equal(committed.retryPermitted, false);
  assert.equal(committed.productionWriterFenced, false);
  assert.equal(scoped.submissions, 1);
  assert.equal(scoped.actions.length, 3);

  const [head, staffEvent, receipt] = scoped.actions;
  assert.deepEqual(
    scoped.actions.map(action => action[0]),
    ["update", "create", "create"]
  );

  for (const action of scoped.actions) {
    const entity = action[1] as {
      partitionKey: string;
      rowKey: string;
    };
    assert.equal(entity.partitionKey, event.staffId);
  }

  const headEntity = head[1] as unknown as {
    rowKey: string;
    revision: number;
    authorizationRevision: number;
    state: string;
  };

  assert.equal(headEntity.rowKey, STAFF_SECURITY_METADATA_HEAD);
  assert.equal(headEntity.revision, 1);
  assert.equal(headEntity.authorizationRevision, 1);
  assert.equal(headEntity.state, "revoked");

  const staffRow = staffEvent[1] as unknown as {
    rowKey: string;
    staffId: string;
    dataJson: string;
  };

  assert.equal(
    staffRow.rowKey,
    `${event.occurredAt}__${event.eventId}`
  );
  assert.equal(staffRow.staffId, event.staffId);
  assert.deepEqual(JSON.parse(staffRow.dataJson), event.data);

  const receiptRow = receipt[1] as unknown as {
    rowKey: string;
    revision: number;
  };

  assert.equal(
    receiptRow.rowKey,
    STAFF_SECURITY_METADATA_RECEIPT_PREFIX + event.eventId
  );
  assert.equal(receiptRow.revision, 1);

  console.log("[PASS] Canonical Staff partition and event identity");
  console.log("[PASS] Three-action same-partition transaction");

  const stale = fixture();
  stale.port.submitTransaction = async () => {
    throw { statusCode: 412 };
  };

  const staleResult = await submitStaffScopedAtomicDeactivation(
    event, stale.port, true
  );

  assert.equal(staleResult.status, "denied");
  assert.equal(staleResult.retryPermitted, false);
  console.log("[PASS] Conditional conflict denied");

  const uncertain = fixture();
  uncertain.port.submitTransaction = async () => {
    throw new Error("synthetic_lost_acknowledgement");
  };

  const uncertainResult = await submitStaffScopedAtomicDeactivation(
    event, uncertain.port, true
  );

  assert.equal(uncertainResult.status, "uncertain");
  assert.equal(uncertainResult.executionPermitted, false);
  assert.equal(uncertainResult.retryPermitted, false);
  console.log("[PASS] Ambiguous acknowledgement remains uncertain");
}

main().catch(() => {
  console.error("[FAIL] Staff-scoped transaction unit regression");
  process.exitCode = 1;
});