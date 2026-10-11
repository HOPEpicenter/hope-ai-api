import assert from "node:assert/strict";

import {
  OAuthOrderingReceiptStorageRepository,
  OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
  type OAuthOrderingReceiptTablePort,
  type OAuthOrderingReceiptTableEntity,
  type OAuthOrderingReceiptWriteEntity
} from "../../src/repositories/oauthOrderingReceiptStorageRepository";

import {
  initialOAuthOrderingReceiptEnvelope,
  type OAuthOrderingReceiptEnvelope
} from "../../src/services/authorization/modelOAuthOrderingTransitionReceipts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

class FakeTable implements OAuthOrderingReceiptTablePort {
  entity: OAuthOrderingReceiptTableEntity | null;
  writes = 0;
  readFailure = false;
  failure: "none" | "before" | "after" = "none";

  constructor(
    envelope: unknown = initialOAuthOrderingReceiptEnvelope()
  ) {
    this.entity = {
      partitionKey: OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
      rowKey: ID,
      envelopeJson: JSON.stringify(envelope),
      etag: "version-0"
    };
  }

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingReceiptTableEntity> {
    if (this.readFailure) {
      throw new Error("read unavailable");
    }

    if (
      !this.entity ||
      this.entity.partitionKey !== partitionKey ||
      this.entity.rowKey !== rowKey
    ) {
      throw Object.assign(new Error("not found"), {
        statusCode: 404
      });
    }

    await new Promise<void>(
      resolve => setImmediate(resolve)
    );

    return { ...this.entity };
  }

  async updateEntity(
    entity: OAuthOrderingReceiptWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown> {
    if (this.failure === "before") {
      throw Error("uncertain before commit");
    }

    if (
      mode !== "Replace" ||
      !this.entity ||
      this.entity.etag !== options.etag
    ) {
      throw Object.assign(new Error("stale ETag"), {
        statusCode: 412
      });
    }

    this.writes++;

    this.entity = {
      ...entity,
      etag: `version-${this.writes}`
    };

    if (this.failure === "after") {
      throw Error("acknowledgement lost");
    }

    return undefined;
  }

  current(): OAuthOrderingReceiptEnvelope {
    if (!this.entity) throw Error("missing fixture");

    return JSON.parse(
      this.entity.envelopeJson
    ) as OAuthOrderingReceiptEnvelope;
  }
}

const claim = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "claim-one"
};

function assertNonAuthorizing(result: {
  retryPermitted: false;
  executionPermitted: false;
}): void {
  assert.equal(result.retryPermitted, false);
  assert.equal(result.executionPermitted, false);
}

async function main(): Promise<void> {
  const table = new FakeTable();

  // Competing claims must result in exactly one
  // atomic envelope (snapshot AND receipt) commit.
  const results = await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      new OAuthOrderingReceiptStorageRepository(
        table
      ).tryTransition(
        ID,
        [
          "aaaaaaaa-aaaa-4aaa-8aaa-",
          String(index).padStart(12, "0")
        ].join(""),
        claim
      )
    )
  );

  assert.equal(
    results.filter(r => r.outcome === "committed").length,
    1
  );

  assert.equal(
    results.filter(r => r.outcome === "denied").length,
    29
  );

  assert.equal(table.writes, 1);

  const stored = table.current();

  assert.equal(stored.snapshot.revision, 1);
  assert.equal(stored.snapshot.state, "claimed");
  assert.equal(stored.receipts.length, 1);
  assert.equal(stored.receipts[0].fromRevision, 0);
  assert.equal(stored.receipts[0].toRevision, 1);

  results.forEach(assertNonAuthorizing);

  // The stored receipt identifies the winner.
  const winner = stored.receipts[0].attemptId;

  assert.equal(
    (await new OAuthOrderingReceiptStorageRepository(
      table
    ).tryTransition(
      ID,
      winner,
      {
        kind: "revoke",
        expectedRevision: 1,
        source: "staff_deactivation"
      }
    )).outcome,
    "denied"
  );

  // A different valid attempt appends history
  // without overwriting the first receipt.
  const revoke =
    await new OAuthOrderingReceiptStorageRepository(
      table
    ).tryTransition(
      ID, B, {
        kind: "revoke",
        expectedRevision: 1,
        source: "staff_deactivation"
      }
    );

  assert.equal(revoke.outcome, "committed");
  assertNonAuthorizing(revoke);

  assert.deepEqual(
    table.current().receipts.map(r => r.attemptId),
    [winner, B]
  );
  assert.equal(
    table.current().snapshot.state,
    "revocation_pending"
  );

  // A missing entity cannot initialize itself.
  const missing = new FakeTable();
  missing.entity = null;

  assert.equal(
    (await new OAuthOrderingReceiptStorageRepository(
      missing
    ).tryTransition(ID, A, claim)).outcome,
    "denied"
  );

  // V1 and corrupted envelopes cannot be upgraded silently.
  for (const invalid of [
    { revision: 0, state: "idle" },
    { schemaVersion: 1, snapshot: {}, receipts: [] },
    { schemaVersion: 2, snapshot: {}, receipts: [] }
  ]) {
    const corrupt = new FakeTable(invalid);

    assert.equal(
      (await new OAuthOrderingReceiptStorageRepository(
        corrupt
      ).tryTransition(ID, A, claim)).outcome,
      "denied"
    );
    assert.equal(corrupt.writes, 0);
  }

  const outage = new FakeTable();
  outage.readFailure = true;

  assert.equal(
    (await new OAuthOrderingReceiptStorageRepository(
      outage
    ).tryTransition(ID, A, claim)).outcome,
    "uncertain"
  );

  const failed = new FakeTable();
  failed.failure = "before";

  const before =
    await new OAuthOrderingReceiptStorageRepository(
      failed
    ).tryTransition(ID, A, claim);

  assert.equal(before.outcome, "uncertain");
  assert.equal(failed.writes, 0);
  assertNonAuthorizing(before);

  // A write can commit despite lost acknowledgement.
  const lost = new FakeTable();
  lost.failure = "after";

  const ambiguous =
    await new OAuthOrderingReceiptStorageRepository(
      lost
    ).tryTransition(ID, C, claim);

  assert.equal(ambiguous.outcome, "uncertain");
  assertNonAuthorizing(ambiguous);
  assert.equal(lost.writes, 1);
  assert.equal(lost.current().receipts[0].attemptId, C);

  // A blind retry never creates another receipt.
  const repeated =
    await new OAuthOrderingReceiptStorageRepository(
      lost
    ).tryTransition(ID, C, claim);

  assert.equal(repeated.outcome, "denied");
  assert.equal(lost.writes, 1);

  for (const etag of ["", "*"]) {
    const invalid = new FakeTable();
    if (!invalid.entity) throw Error("missing entity");
    invalid.entity.etag = etag;

    assert.equal(
      (await new OAuthOrderingReceiptStorageRepository(
        invalid
      ).tryTransition(ID, A, claim)).outcome,
      "denied"
    );
  }

  // Never accept a non-UUID coordination identifier
  // or attempt identifier.
  const invalidIds = new FakeTable();

  assert.equal(
    (await new OAuthOrderingReceiptStorageRepository(
      invalidIds
    ).tryTransition("wrong", A, claim)).outcome,
    "denied"
  );

  assert.equal(
    (await new OAuthOrderingReceiptStorageRepository(
      invalidIds
    ).tryTransition(ID, "wrong", claim)).outcome,
    "denied"
  );

  assert.equal(invalidIds.writes, 0);

  console.log(
    "OAuth ordering receipt conditional storage tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
