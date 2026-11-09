import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  submitStaffScopedAtomicMutation
} from "../../src/repositories/staffScopedAtomicMutation";

function event(
  type: StaffEvent["type"] = "staff.updated",
  data: StaffEvent["data"] = { displayName: "Updated Synthetic" }
): StaffEvent {
  return {
    eventId: "synthetic-update",
    staffId: "synthetic-staff",
    type,
    occurredAt: "2026-11-09T12:00:00.000Z",
    actorId: "synthetic-admin",
    data
  };
}

function fixture(
  head: Record<string, unknown> | null = {
    state: "active",
    revision: 7,
    etag: "synthetic-etag"
  }
) {
  const transactions: TransactionAction[][] = [];
  let reads = 0;

  const port: StaffScopedAtomicPort = {
    async getEntity() {
      reads++;
      return head;
    },
    async submitTransaction(actions) {
      transactions.push(actions);
      return [];
    }
  };

  return {
    port,
    transactions,
    get reads() { return reads; }
  };
}

async function run(): Promise<void> {
  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event(), f.port
    );

    assert.equal(result.status, "denied");
    assert.equal(f.reads, 0);
    assert.equal(f.transactions.length, 0);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
    console.log("[PASS] Default-disabled with zero storage access");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event(), f.port, true
    );

    assert.equal(result.status, "committed");
    assert.equal(result.productionWriterFenced, false);
    assert.equal(f.transactions.length, 1);

    const actions = f.transactions[0];
    assert.equal(actions.length, 3);
    assert.equal(actions[0][0], "update");
    assert.equal(actions[1][0], "create");
    assert.equal(actions[2][0], "create");

    const head = actions[0][1] as Record<string, unknown>;
    const canonical = actions[1][1] as Record<string, unknown>;
    const receipt = actions[2][1] as Record<string, unknown>;

    assert.equal(head.partitionKey, "synthetic-staff");
    assert.equal(canonical.partitionKey, "synthetic-staff");
    assert.equal(receipt.partitionKey, "synthetic-staff");
    assert.equal(head.revision, 8);
    assert.equal(head.state, "active");
    assert.equal(
      head.rowKey, "__staff_security__head"
    );
    assert.equal(
      canonical.rowKey,
      "2026-11-09T12:00:00.000Z__synthetic-update"
    );
    assert.equal(canonical.type, "staff.updated");
    assert.equal(
      receipt.rowKey,
      "__staff_security__receipt__synthetic-update"
    );

    console.log("[PASS] Shared-head three-action transaction");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event("staff.activated", { status: "active" }),
      f.port, true
    );

    assert.equal(result.status, "committed");
    assert.equal(f.transactions.length, 1);
    console.log("[PASS] Invitation activation participates");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event("staff.updated", {
        entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
        entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
      }),
      f.port, true
    );

    assert.equal(result.status, "committed");
    console.log("[PASS] Valid binding change participates");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event("staff.updated", { status: "inactive" }),
      f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(f.reads, 0);
    console.log("[PASS] Revocation cannot use active-head path");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event("staff.updated", {
        entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9"
      }),
      f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(f.reads, 0);
    console.log("[PASS] Partial binding denied");
  }

  {
    const f = fixture({
      state: "revoked", revision: 8, etag: "revoked-etag"
    });

    const result = await submitStaffScopedAtomicMutation(
      event(), f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Revoked security head denies updates");
  }

  {
    const f = fixture(null);
    const result = await submitStaffScopedAtomicMutation(
      event(), f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Missing security head denied");
  }

  {
    const f = fixture();
    f.port.submitTransaction = async () => {
      throw { statusCode: 412 };
    };

    const result = await submitStaffScopedAtomicMutation(
      event(), f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(result.retryPermitted, false);
    console.log("[PASS] ETag conflict denied");
  }

  {
    const f = fixture();
    f.port.submitTransaction = async () => {
      throw new Error("Synthetic lost acknowledgement");
    };

    const result = await submitStaffScopedAtomicMutation(
      event(), f.port, true
    );

    assert.equal(result.status, "uncertain");
    assert.equal(result.retryPermitted, false);
    assert.equal(result.executionPermitted, false);
    console.log("[PASS] Lost acknowledgement remains uncertain");
  }

  {
    const f = fixture();
    const result = await submitStaffScopedAtomicMutation(
      event("staff.created", {
        displayName: "Synthetic", status: "active"
      }),
      f.port, true
    );

    assert.equal(result.status, "denied");
    assert.equal(f.reads, 0);
    console.log("[PASS] Identity creation requires separate protocol");
  }

  console.log("[PASS] Shared Staff mutation unit regressions");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});