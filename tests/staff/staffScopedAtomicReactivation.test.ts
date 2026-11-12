import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  submitStaffScopedAtomicReactivation,
  type StaffReactivationAuthorizationPort
} from "../../src/repositories/staffScopedAtomicReactivation";
import {
  STAFF_SECURITY_METADATA_HEAD
} from "../../src/repositories/staffEventsRepository";

const staffId = "synthetic-reactivation-staff";
const event = {
  eventId: "synthetic-reactivation-event",
  staffId,
  type: "staff.activated" as const,
  occurredAt: "2026-11-09T12:00:00.000Z",
  actorId: "synthetic-reactivation-admin",
  data: { status: "active" as const }
};

function fixture(head: Record<string, unknown> | null = {
  partitionKey: staffId,
  rowKey: STAFF_SECURITY_METADATA_HEAD,
  revision: 4,
  authorizationRevision: 4,
  state: "revoked",
  etag: 'W/"synthetic-head-etag"'
}) {
  let reads = 0;
  const transactions: TransactionAction[][] = [];
  let submit: (actions: TransactionAction[]) => Promise<unknown> =
    async actions => { transactions.push(actions); };
  let authorize: StaffReactivationAuthorizationPort["authorizeReactivation"] =
    async input => ({
      authorized: true,
      staffId: input.staffId,
      eventId: input.eventId,
      actorId: input.actorId,
      authorizationRevision: input.authorizationRevision
    });

  const port: StaffScopedAtomicPort = {
    async getEntity() {
      reads++;
      return head;
    },
    async submitTransaction(actions) {
      return submit(actions);
    }
  };

  return {
    port,
    transactions,
    get reads() { return reads; },
    setSubmit(handler: (actions: TransactionAction[]) => Promise<unknown>) {
      submit = handler;
    },
    setAuthorize(
      handler: StaffReactivationAuthorizationPort["authorizeReactivation"]
    ) {
      authorize = handler;
    },
    get authorizationPort(): StaffReactivationAuthorizationPort {
      return { authorizeReactivation: input => authorize(input) };
    }
  };
}

async function main(): Promise<void> {
  {
    const f = fixture();
    const denied = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort
    );
    assert.equal(denied.status, "denied");
    assert.equal(f.reads, 0);
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Reactivation is disabled by default");
  }

  {
    const f = fixture();
    const committed = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(committed.status, "committed");
    assert.equal(committed.executionPermitted, false);
    assert.equal(committed.retryPermitted, false);
    assert.equal(committed.productionWriterFenced, false);
    assert.equal(f.transactions.length, 1);
    assert.deepEqual(f.transactions[0].map(action => action[0]), [
      "update", "create", "create"
    ]);
    assert.deepEqual(f.transactions[0][0][1], {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 5,
      authorizationRevision: 5,
      state: "active"
    });
    assert.equal(f.transactions[0][0][3]?.etag, 'W/"synthetic-head-etag"');
    assert.equal(
      (f.transactions[0][1][1] as Record<string, unknown>).type,
      "staff.activated"
    );
    console.log("[PASS] Authorized revoked-to-active transaction");
  }

  for (const invalidHead of [
    null,
    {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 4,
      state: "revoked",
      etag: 'W/"synthetic-head-etag"'
    },
    {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 5,
      authorizationRevision: 4,
      state: "revoked",
      etag: 'W/"synthetic-head-etag"'
    },
    {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 4,
      authorizationRevision: 4,
      state: "pending",
      etag: 'W/"synthetic-head-etag"'
    },
    {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 4,
      authorizationRevision: 4,
      state: "revoked"
    }
  ]) {
    const f = fixture(invalidHead);
    let authorizationCalls = 0;
    f.setAuthorize(async () => {
      authorizationCalls++;
      return null;
    });
    const denied = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(denied.status, "denied");
    assert.equal(authorizationCalls, 0);
    assert.equal(f.transactions.length, 0);
  }
  console.log("[PASS] Missing, stale, pending, or malformed heads denied");

  {
    const f = fixture();
    f.setAuthorize(async input => ({
      authorized: true,
      staffId: input.staffId,
      eventId: input.eventId,
      actorId: input.actorId,
      authorizationRevision: input.authorizationRevision - 1
    }));
    const denied = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(denied.status, "denied");
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Authorization for a stale revision denied");
  }

  {
    const f = fixture();
    f.setAuthorize(async input => ({
      authorized: true,
      staffId: "different-synthetic-staff",
      eventId: input.eventId,
      actorId: input.actorId,
      authorizationRevision: input.authorizationRevision
    }));
    const denied = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(denied.status, "denied");
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Authorization for a mismatched identity denied");
  }

  for (const error of [
    { statusCode: 409 },
    new Error("synthetic acknowledgement uncertain")
  ]) {
    const f = fixture();
    f.setSubmit(async () => { throw error; });
    const result = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(
      result.status,
      error instanceof Error ? "uncertain" : "denied"
    );
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
    assert.equal(f.transactions.length, 0);
  }
  console.log("[PASS] Conflicts and uncertain acknowledgements fail closed");

  {
    const f = fixture();
    f.setAuthorize(async () => {
      throw new Error("synthetic authorization unavailable");
    });
    const result = await submitStaffScopedAtomicReactivation(
      event, f.port, f.authorizationPort, true
    );
    assert.equal(result.status, "uncertain");
    assert.equal(f.transactions.length, 0);
  }
  console.log("[PASS] Uncertain authorization fails closed");
}

main().catch(() => {
  console.error("[FAIL] Staff reactivation regression");
  process.exitCode = 1;
});
