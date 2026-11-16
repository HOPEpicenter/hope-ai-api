import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync, sign
} from "node:crypto";

import {
  createSignedApprovalLedger
} from "./signed-approval-ledger.mjs";

import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

const keys = generateKeyPairSync("ed25519");
const nowMs = Date.parse("2026-11-16T12:00:00.000Z");

const expected = {
  operationId: "synthetic_operation_001",
  purpose: "FIRST_CANONICAL_STAFF_BOOTSTRAP",
  target: { ...KIOSK_BOOTSTRAP_TARGET }
};

const trusted = {
  keyId: "synthetic_owner_key_001",
  publicKeyPem: keys.publicKey.export({
    type: "spki", format: "pem"
  }),
  ownerObjectId: "11111111-2222-4333-8444-555555555555",
  nowMs
};

function envelope() {
  const payload = JSON.stringify({
    operationId: expected.operationId,
    purpose: expected.purpose,
    target: expected.target,
    ownerObjectId: trusted.ownerObjectId,
    issuedAt: "2026-11-16T11:59:00.000Z",
    expiresAt: "2026-11-16T12:05:00.000Z"
  });

  return {
    keyId: trusted.keyId,
    payload,
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      keys.privateKey
    ).toString("base64")
  };
}

/**
 * Synthetic atomic Table-style transaction.
 * It is deliberately not an Azure client.
 */
function syntheticTable() {
  const rows = new Map();
  let transactionCalls = 0;

  return {
    get calls() {
      return transactionCalls;
    },
    async submitTransaction(actions) {
      transactionCalls++;

      const additions = new Map();

      for (const [verb, entity] of actions) {
        assert.equal(verb, "create");

        const key =
          `${entity.partitionKey}:${entity.rowKey}`;

        if (rows.has(key) || additions.has(key)) {
          throw { statusCode: 409 };
        }

        additions.set(key, { ...entity });
      }

      // All-or-nothing synthetic commit.
      for (const [key, entity] of additions) {
        rows.set(key, entity);
      }
    },
    async getEntity(partitionKey, rowKey) {
      const entity = rows.get(`${partitionKey}:${rowKey}`);
      if (!entity) {
        throw { statusCode: 404 };
      }
      return { ...entity };
    },
    rows
  };
}

function disabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.realOwnerAuthorityVerified, false);
}

test("missing transaction port is rejected", () => {
  assert.throws(
    () => createSignedApprovalLedger({}),
    /TRANSACTION_AND_READ_PORT_REQUIRED/
  );
});

test("valid synthetic signature creates atomic claim and audit", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  const result = await ledger.consumeForDesign(
    envelope(), expected, trusted
  );

  disabled(result);
  assert.equal(result.signatureValid, true);
  assert.equal(result.approvalConsumedForDesign, true);
  assert.equal(table.calls, 1);
  assert.equal(table.rows.size, 2);
});

test("replayed signed approval cannot be consumed again", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);
  const item = envelope();

  await ledger.consumeForDesign(item, expected, trusted);
  const second = await ledger.consumeForDesign(
    item, expected, trusted
  );

  disabled(second);
  assert.equal(second.status, "ALREADY_CONSUMED_OR_CONFLICT");
  assert.equal(table.rows.size, 2);
});

test("tampered signature cannot reach transaction", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);
  const item = envelope();
  item.payload += " ";

  const result = await ledger.consumeForDesign(
    item, expected, trusted
  );

  disabled(result);
  assert.equal(result.status, "SIGNED_APPROVAL_NOT_ACCEPTED");
  assert.equal(table.calls, 0);
});

test("untrusted signing key cannot reach transaction", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  const result = await ledger.consumeForDesign(
    envelope(),
    expected,
    { ...trusted, keyId: "different_key_001" }
  );

  disabled(result);
  assert.equal(table.calls, 0);
});

test("transaction failure leaves no synthetic partial records", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger({
    async submitTransaction() {
      throw Error("synthetic failure before commit");
    },
    getEntity: table.getEntity.bind(table)
  });

  const result = await ledger.consumeForDesign(
    envelope(), expected, trusted
  );

  disabled(result);
  assert.equal(
    result.status,
    "OUTCOME_UNKNOWN_STOP_AND_RECONCILE"
  );
  assert.equal(table.rows.size, 0);
});

test("read-only reconciliation verifies complete receipt", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  await ledger.consumeForDesign(
    envelope(), expected, trusted
  );

  const result = await ledger.inspectForDesign(
    expected.operationId
  );

  disabled(result);
  assert.equal(
    result.status,
    "DESIGN_RECEIPT_RECONCILED_READ_ONLY"
  );
  assert.equal(table.calls, 1);
});

test("missing receipt fails closed", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  const result = await ledger.inspectForDesign(
    expected.operationId
  );

  disabled(result);
  assert.equal(
    result.status,
    "RECONCILIATION_INCOMPLETE_STOP"
  );
});

test("corrupted audit record is rejected", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  await ledger.consumeForDesign(
    envelope(), expected, trusted
  );

  const receiptKey = [...table.rows.keys()]
    .find((key) => key.includes(":audit_"));

  table.rows.get(receiptKey).signatureDigest = "tampered";

  const result = await ledger.inspectForDesign(
    expected.operationId
  );

  disabled(result);
  assert.equal(result.status, "AUDIT_MISMATCH_STOP");
});

test("caller approval flag cannot bypass signature verification", async () => {
  const table = syntheticTable();
  const ledger = createSignedApprovalLedger(table);

  const result = await ledger.consumeForDesign(
    { ownerApproved: true, verified: true },
    expected,
    trusted
  );

  disabled(result);
  assert.equal(table.calls, 0);
});

test("ledger exposes no Staff writer or delete capability", () => {
  const ledger = createSignedApprovalLedger(
    syntheticTable()
  );

  assert.equal(ledger.createStaff, undefined);
  assert.equal(ledger.delete, undefined);
  assert.equal(ledger.upsert, undefined);
  assert.equal(Object.isFrozen(ledger), true);
});