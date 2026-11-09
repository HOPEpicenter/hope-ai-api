import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";

import {
  submitStaffAtomicDeactivationPrototype,
  type StaffAtomicDeactivationPort
} from "../../src/repositories/staffAtomicDeactivationPrototype";

import {
  STAFF_SECURITY_PROTOTYPE_PARTITION,
  STAFF_SECURITY_HEAD_ROW
} from "../../src/repositories/oauthStaffSecurityStorageRepository";

const event = {
  eventId: "evt-test-deactivation",
  staffId: "staff-test",
  actorId: "staff-admin",
  type: "staff.deactivated",
  occurredAt: "2026-11-09T12:00:00.000Z",
  data: {
    status: "inactive",
    reason: "Synthetic test"
  }
} as const;

function fakePort() {
  let reads = 0;
  let submissions = 0;
  let observed: TransactionAction[] = [];

  const port: StaffAtomicDeactivationPort = {
    async getEntity(partition, row) {
      reads++;
      assert.equal(partition, STAFF_SECURITY_PROTOTYPE_PARTITION);
      assert.equal(row, STAFF_SECURITY_HEAD_ROW);

      return {
        revision: 0,
        state: "active",
        etag: "etag-test"
      };
    },
    async submitTransaction(actions) {
      submissions++;
      observed = actions;
    }
  };

  return {
    port,
    get reads() { return reads; },
    get submissions() { return submissions; },
    get actions() { return observed; }
  };
}

async function main(): Promise<void> {
  const disabled = fakePort();

  assert.deepEqual(
    await submitStaffAtomicDeactivationPrototype(
      event, disabled.port
    ),
    {
      outcome: "denied",
      executionPermitted: false,
      retryPermitted: false,
      productionWriterFenced: false
    }
  );

  assert.equal(disabled.reads, 0);
  assert.equal(disabled.submissions, 0);
  console.log("[PASS] Default-disabled behavior");

  const invalid = fakePort();

  const malformed = {
    ...event,
    data: { status: "active" }
  };

  assert.equal(
    (await submitStaffAtomicDeactivationPrototype(
      malformed, invalid.port, true
    )).outcome,
    "denied"
  );

  assert.equal(invalid.submissions, 0);
  console.log("[PASS] Invalid deactivation denied");

  const accepted = fakePort();

  const decision = await submitStaffAtomicDeactivationPrototype(
    event, accepted.port, true
  );

  assert.equal(decision.outcome, "committed");
  assert.equal(decision.executionPermitted, false);
  assert.equal(decision.retryPermitted, false);
  assert.equal(decision.productionWriterFenced, false);
  assert.equal(accepted.submissions, 1);
  assert.equal(accepted.actions.length, 3);

  const [head, staffEvent, receipt] = accepted.actions;

  assert.equal(head[0], "update");
  assert.equal(staffEvent[0], "create");
  assert.equal(receipt[0], "create");

  const entities = accepted.actions.map(
    action => action[1] as { partitionKey: string }
  );

  assert.ok(entities.every(
    entity =>
      entity.partitionKey === STAFF_SECURITY_PROTOTYPE_PARTITION
  ));

  const headEntity = head[1] as unknown as {
    revision: number;
    state: string;
  };

  assert.equal(headEntity.revision, 1);
  assert.equal(headEntity.state, "revoked");

  const eventEntity = staffEvent[1] as unknown as {
    staffId: string;
    dataJson: string;
  };

  assert.equal(eventEntity.staffId, event.staffId);
  assert.deepEqual(JSON.parse(eventEntity.dataJson), event.data);

  const receiptEntity = receipt[1] as unknown as {
    eventId: string;
    revision: number;
  };

  assert.equal(receiptEntity.eventId, event.eventId);
  assert.equal(receiptEntity.revision, 1);

  console.log("[PASS] Three-action same-partition transaction");

  const conflict = fakePort();

  conflict.port.submitTransaction = async () => {
    throw { statusCode: 412 };
  };

  const conflictDecision =
    await submitStaffAtomicDeactivationPrototype(
      event, conflict.port, true
    );

  assert.equal(conflictDecision.outcome, "denied");
  assert.equal(conflictDecision.retryPermitted, false);

  console.log("[PASS] Conditional-write conflict denied");

  const uncertain = fakePort();

  uncertain.port.submitTransaction = async () => {
    throw new Error("synthetic_lost_acknowledgement");
  };

  const uncertainDecision =
    await submitStaffAtomicDeactivationPrototype(
      event, uncertain.port, true
    );

  assert.equal(uncertainDecision.outcome, "uncertain");
  assert.equal(uncertainDecision.executionPermitted, false);
  assert.equal(uncertainDecision.retryPermitted, false);

  console.log("[PASS] Lost acknowledgement remains uncertain");

  console.log(
    "[PASS] Isolated atomic Staff deactivation regressions"
  );
}

main().catch(() => {
  console.error(
    "[FAIL] Isolated Staff deactivation prototype test"
  );
  process.exitCode = 1;
});