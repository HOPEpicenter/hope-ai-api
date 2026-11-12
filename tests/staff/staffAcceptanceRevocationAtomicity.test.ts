import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import {
  ENTRA_STAFF_ACCEPTANCE_OPERATION
} from "../../src/repositories/entraStaffAcceptanceHandoffReceiptStorageRepository";
import {
  consumeStaffAcceptanceReceiptAtomically,
  type StaffAcceptanceAtomicReceiptConsumption
} from "../../src/repositories/staffAcceptanceRevocationAtomicityProof";
import {
  submitStaffScopedAtomicCreation
} from "../../src/repositories/staffScopedAtomicCreation";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import {
  submitStaffScopedAtomicMutation
} from "../../src/repositories/staffScopedAtomicMutation";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

const now = 2_000_000_000_000;
const staffId = "synthetic-staff";
const receiptId = "a".repeat(64);
const digest = "b".repeat(64);

function request(
  overrides: Partial<StaffAcceptanceAtomicReceiptConsumption> = {}
): StaffAcceptanceAtomicReceiptConsumption {
  return {
    staffId,
    receiptId,
    operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
    identityDigest: digest,
    authorizationRevision: 4,
    ...overrides
  };
}

function fixture(
  head: Record<string, unknown> | null = {
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: 4,
    authorizationRevision: 4,
    state: "active",
    etag: "head-etag"
  },
  receipt: Record<string, unknown> | null = {
    partitionKey: staffId,
    rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
    schemaVersion: 1,
    operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
    identityDigest: digest,
    authorizationRevision: 4,
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 30_000,
    state: "issued",
    revision: 0,
    etag: "receipt-etag"
  }
) {
  let reads = 0;
  const transactions: TransactionAction[][] = [];
  let submit: (actions: TransactionAction[]) => Promise<unknown> =
    async actions => {
      transactions.push(actions);
      return [];
    };

  const port: StaffScopedAtomicPort = {
    async getEntity(_partitionKey, rowKey) {
      reads++;
      return rowKey === STAFF_SECURITY_METADATA_HEAD ? head : receipt;
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
    }
  };
}

async function main(): Promise<void> {
  {
    const f = fixture();
    const disabled = await consumeStaffAcceptanceReceiptAtomically(
      request(), f.port, false, () => now
    );
    assert.equal(disabled.status, "denied");
    assert.equal(f.reads, 0);
    assert.equal(f.transactions.length, 0);
  }

  {
    const f = fixture();
    const consumed = await consumeStaffAcceptanceReceiptAtomically(
      request(), f.port, true, () => now
    );
    assert.equal(consumed.status, "committed");
    assert.equal(consumed.executionPermitted, false);
    assert.equal(consumed.retryPermitted, false);
    assert.equal(consumed.productionWriterFenced, false);
    assert.equal(f.transactions.length, 1);
    assert.deepEqual(
      f.transactions[0].map(action => action[0]),
      ["update", "update"]
    );

    const [headUpdate, receiptUpdate] = f.transactions[0];
    assert.equal(headUpdate[3]?.etag, "head-etag");
    assert.equal(receiptUpdate[3]?.etag, "receipt-etag");
    assert.deepEqual(headUpdate[1], {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 5,
      authorizationRevision: 5,
      state: "active"
    });
    assert.deepEqual(receiptUpdate[1], {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
      schemaVersion: 1,
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityDigest: digest,
      authorizationRevision: 4,
      issuedAtMs: now - 1_000,
      expiresAtMs: now + 30_000,
      state: "consumed",
      revision: 1,
      consumedAtMs: now
    });
  }

  {
    let actions: TransactionAction[] = [];
    const creation = await submitStaffScopedAtomicCreation(
      {
        eventId: "synthetic-create",
        staffId,
        type: "staff.created",
        occurredAt: "2026-11-09T12:00:00.000Z",
        actorId: "synthetic-admin",
        data: {
          displayName: "Synthetic Staff",
          status: "active",
          entraTenantId: "11111111-1111-4111-8111-111111111111",
          entraObjectId: "22222222-2222-4222-8222-222222222222"
        }
      },
      {
        submitTransaction: async submitted => { actions = submitted; }
      },
      true
    );
    assert.equal(creation.status, "committed");
    assert.equal(
      (actions[0][1] as Record<string, unknown>).authorizationRevision,
      0
    );
  }

  {
    let actions: TransactionAction[] = [];
    const mutation = await submitStaffScopedAtomicMutation(
      {
        eventId: "synthetic-binding-update",
        staffId,
        type: "staff.updated",
        occurredAt: "2026-11-09T12:00:00.000Z",
        actorId: "synthetic-admin",
        data: {
          entraTenantId: "11111111-1111-4111-8111-111111111111",
          entraObjectId: "22222222-2222-4222-8222-222222222222"
        }
      },
      {
        async getEntity() {
          return {
            partitionKey: staffId,
            rowKey: STAFF_SECURITY_METADATA_HEAD,
            revision: 4,
            authorizationRevision: 4,
            state: "active",
            etag: "head-etag"
          };
        },
        async submitTransaction(submitted) { actions = submitted; }
      },
      true
    );
    assert.equal(mutation.status, "committed");
    assert.equal(
      (actions[0][1] as Record<string, unknown>).authorizationRevision,
      5
    );

    const inconsistent = await submitStaffScopedAtomicMutation(
      {
        eventId: "synthetic-inconsistent-head",
        staffId,
        type: "staff.updated",
        occurredAt: "2026-11-09T12:00:00.000Z",
        actorId: "synthetic-admin",
        data: { displayName: "Synthetic Staff" }
      },
      {
        async getEntity() {
          return {
            partitionKey: staffId,
            rowKey: STAFF_SECURITY_METADATA_HEAD,
            revision: 4,
            authorizationRevision: 3,
            state: "active",
            etag: "head-etag"
          };
        },
        async submitTransaction() {
          assert.fail("inconsistent head must not be submitted");
        }
      },
      true
    );
    assert.equal(inconsistent.status, "denied");
  }

    {
      const f = fixture({
        partitionKey: staffId,
        rowKey: STAFF_SECURITY_METADATA_HEAD,
        revision: 4,
        state: "active",
        etag: "head-etag"
      });
      const missingAuthorizationRevision =
        await consumeStaffAcceptanceReceiptAtomically(
          request(), f.port, true, () => now
        );
      assert.equal(missingAuthorizationRevision.status, "denied");
      assert.equal(f.transactions.length, 0);
    }

  for (const [label, head, receipt, input] of [
    ["inactive head", {
      partitionKey: staffId, rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 4, authorizationRevision: 4, state: "revoked",
      etag: "head-etag"
    }, undefined, request()],
    ["stale authorization revision", {
      revision: 5, authorizationRevision: 5, state: "active",
      partitionKey: staffId, rowKey: STAFF_SECURITY_METADATA_HEAD,
      etag: "head-etag"
    }, undefined, request()],
    ["mismatched identity binding", undefined, {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
      schemaVersion: 1,
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityDigest: "c".repeat(64),
      authorizationRevision: 4,
      issuedAtMs: now - 1_000,
      expiresAtMs: now + 30_000,
      state: "issued",
      revision: 0,
      etag: "receipt-etag"
    }, request()],
    ["expired receipt", undefined, {
      partitionKey: staffId,
      rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + receiptId,
      schemaVersion: 1,
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityDigest: digest,
      authorizationRevision: 4,
      issuedAtMs: now - 1_000,
      expiresAtMs: now + 30_000,
      state: "issued",
      revision: 0,
      etag: "receipt-etag"
    }, request()]
  ] as const) {
    const f = fixture(
      head === undefined ? undefined : head,
      receipt === undefined ? undefined : receipt
    );
    const clock = label === "expired receipt"
      ? () => now + 30_000
      : () => now;
    const result = await consumeStaffAcceptanceReceiptAtomically(
      input, f.port, true, clock
    );
    assert.equal(result.status, "denied", label);
    assert.equal(f.transactions.length, 0, label);
  }

  {
    const f = fixture(null);
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        request(), f.port, true, () => now
      )).status,
      "denied"
    );
    assert.equal(f.transactions.length, 0);
  }

  {
    const f = fixture();
    f.setSubmit(async () => { throw { statusCode: 412 }; });
    const stale = await consumeStaffAcceptanceReceiptAtomically(
      request(), f.port, true, () => now
    );
    assert.equal(stale.status, "denied");
    assert.equal(f.transactions.length, 0);
  }

  {
    const f = fixture();
    f.setSubmit(async () => { throw new Error("synthetic transport failure"); });
    const uncertain = await consumeStaffAcceptanceReceiptAtomically(
      request(), f.port, true, () => now
    );
    assert.equal(uncertain.status, "uncertain");
    assert.equal(uncertain.executionPermitted, false);
    assert.equal(uncertain.retryPermitted, false);
  }

  {
    const f = fixture();
    f.port.getEntity = async () => {
      throw { statusCode: 404, code: "EntityNotFound" };
    };
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        request(), f.port, true, () => now
      )).status,
      "denied"
    );
  }

  {
    const f = fixture();
    f.port.getEntity = async () => {
      throw { statusCode: 503 };
    };
    assert.equal(
      (await consumeStaffAcceptanceReceiptAtomically(
        request(), f.port, true, () => now
      )).status,
      "uncertain"
    );
  }

  console.log("[PASS] Atomic receipt-consumption synthetic regressions");
}

main().catch(() => {
  console.error("[FAIL] Atomic receipt-consumption synthetic regressions");
  process.exitCode = 1;
});
