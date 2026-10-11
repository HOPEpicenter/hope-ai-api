import assert from "node:assert/strict";

import {
  OAuthOrderingReceiptReconciliationReader
} from "../../src/repositories/readOAuthOrderingReceiptReconciliation";

import {
  OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
  type OAuthOrderingReceiptTableEntity
} from "../../src/repositories/oauthOrderingReceiptStorageRepository";

import {
  initialOAuthOrderingReceiptEnvelope,
  modelOAuthOrderingReceiptTransition
} from "../../src/services/authorization/modelOAuthOrderingTransitionReceipts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const initial = initialOAuthOrderingReceiptEnvelope();

const claim = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "synthetic-worker"
};

const first = modelOAuthOrderingReceiptTransition(
  initial, A, claim
);

if (!first.accepted) throw Error("Expected claim");

const revoke = {
  kind: "revoke" as const,
  expectedRevision: 1,
  source: "staff_deactivation" as const
};

const second = modelOAuthOrderingReceiptTransition(
  first.next, B, revoke
);

if (!second.accepted) throw Error("Expected revocation");
const secondEnvelope = second.next;

class FakeReadOnlyTable {
  reads = 0;
  observed: unknown = secondEnvelope;
  failure = false;
  missing = false;
  wrongKey = false;
  badEtag = false;
  malformedJson = false;

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingReceiptTableEntity> {
    this.reads++;

    if (this.failure) {
      throw new Error("storage unavailable");
    }

    if (this.missing) {
      throw Object.assign(new Error("not found"), {
        statusCode: 404
      });
    }

    return {
      partitionKey: this.wrongKey ? "wrong" : partitionKey,
      rowKey: this.wrongKey ? "wrong" : rowKey,
      envelopeJson: this.malformedJson
        ? "{invalid"
        : JSON.stringify(this.observed),
      etag: this.badEtag ? "*" : "etag-1"
    };
  }
}

async function main(): Promise<void> {
  const table = new FakeReadOnlyTable();

  const reader = new OAuthOrderingReceiptReconciliationReader(
    table
  );

  async function check(
    attemptId: string = A,
    before = initial.snapshot,
    command = claim
  ) {
    const outcome = await reader.inspect(
      ID, attemptId, before, command
    );

    assert.equal(outcome.retryPermitted, false);
    assert.equal(outcome.executionPermitted, false);

    return outcome.status;
  }

  // Earlier attempt remains recorded after revocation.
  assert.equal(await check(), "recorded");

  // A different attempt is not falsely attributed.
  assert.equal(
    await check(C),
    "absent_unproven"
  );

  // A valid but incompatible stored receipt is explicit
  // conflicting evidence, never authorization.
  assert.equal(
    await check(B),
    "conflicting_evidence"
  );

  // A valid earlier snapshot can be checked before
  // later evidence is observed.
  table.observed = initial;
  assert.equal(await check(), "absent_unproven");

  table.observed = secondEnvelope;

  // Storage faults, missing rows, invalid keys, malformed
  // ETags and JSON must not establish a receipt.
  for (const fault of [
    "failure",
    "missing",
    "wrongKey",
    "badEtag",
    "malformedJson"
  ] as const) {
    table[fault] = true;
    assert.equal(
      await check(),
      "unresolved",
      `Fail-closed outcome for ${fault}`
    );
    table[fault] = false;
  }

  table.observed = {
    ...secondEnvelope,
    snapshot: {
      ...secondEnvelope.snapshot,
      revision: 99
    }
  };

  assert.equal(await check(), "unresolved");
  table.observed = secondEnvelope;

  // Invalid identifiers must not trigger storage reads.
  const beforeReads = table.reads;

  const invalidCoordination = await reader.inspect(
    "wrong", A, initial.snapshot, claim
  );

  assert.equal(invalidCoordination.status, "unresolved");

  const invalidAttempt = await reader.inspect(
    ID, "wrong", initial.snapshot, claim
  );

  assert.equal(invalidAttempt.status, "unresolved");
  assert.equal(table.reads, beforeReads);

  // No write method exists on this read-only fake port.
  assert.equal(
    typeof (table as unknown as {
      updateEntity?: unknown
    }).updateEntity,
    "undefined"
  );

  assert.equal(
    OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
    "OAUTH_ORDERING_RECEIPTS_V2"
  );

  console.log(
    "OAuth V2 trusted receipt reconciliation reader tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
