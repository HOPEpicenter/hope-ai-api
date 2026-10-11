import assert from "node:assert/strict";

import {
  OAuthOrderingReconciliationReader
} from "../../src/repositories/readOAuthOrderingReconciliation";

import {
  OAUTH_ORDERING_PARTITION_KEY,
  type OAuthOrderingTableEntity
} from "../../src/repositories/oauthOrderingCoordinationRepository";

import {
  initialOAuthOrderingSnapshot,
  modelOAuthRevocationOrdering
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const before = initialOAuthOrderingSnapshot();

const command = {
  kind: "claim" as const,
  expectedRevision: 0,
  claimId: "synthetic-claim"
};

const modeled = modelOAuthRevocationOrdering(
  before, command
);

if (!modeled.accepted) {
  throw Error("Expected accepted synthetic transition");
}

const next = modeled.next;

class ReadOnlyFake {
  reads = 0;
  stored: unknown = next;
  fail = false;
  missing = false;
  badEtag = false;
  badKeys = false;
  malformedJson = false;

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingTableEntity> {
    this.reads++;

    if (this.fail) {
      throw new Error("transient storage failure");
    }

    if (this.missing) {
      throw Object.assign(new Error("missing"), {
        statusCode: 404
      });
    }

    return {
      partitionKey: this.badKeys ? "wrong" : partitionKey,
      rowKey: this.badKeys ? "wrong" : rowKey,
      snapshotJson: this.malformedJson
        ? "{invalid"
        : JSON.stringify(this.stored),
      etag: this.badEtag ? "*" : "etag-1"
    };
  }
}

async function main(): Promise<void> {
  const table = new ReadOnlyFake();

  // The trusted adapter reads the real table port;
  // callers supply intent, not observed state.
  const reader = new OAuthOrderingReconciliationReader(
    table
  );

  const check = async () => {
    const result = await reader.inspect(
      ID, before, command
    );

    assert.equal(result.exactCommitProven, false);
    assert.equal(result.retryPermitted, false);
    assert.equal(result.executionPermitted, false);

    return result.status;
  };

  assert.equal(
    await check(),
    "consistent_unproven"
  );

  table.stored = before;
  assert.equal(await check(), "not_observed");

  table.stored = {
    ...next,
    revision: 2,
    state: "uncertain"
  };
  assert.equal(await check(), "superseded");

  table.stored = {
    revision: 1,
    state: "revoked",
    claimId: null,
    revocationSource: "staff_deactivation"
  };
  assert.equal(await check(), "unresolved");

  table.stored = next;

  for (const fault of [
    "fail",
    "missing",
    "badEtag",
    "badKeys",
    "malformedJson"
  ] as const) {
    table[fault] = true;

    assert.equal(
      await check(),
      "unresolved",
      `Expected fail-closed outcome for ${fault}`
    );

    table[fault] = false;
  }

  table.stored = { revision: "invalid" };
  assert.equal(await check(), "unresolved");

  // Reject invalid inputs before a storage read.
  const readsBefore = table.reads;

  const invalid = await reader.inspect(
    "invalid-coordination-id",
    before,
    command
  );

  assert.equal(invalid.status, "unresolved");
  assert.equal(table.reads, readsBefore);

  // The port does not expose write methods.
  assert.equal(
    typeof (table as unknown as {
      updateEntity?: unknown
    }).updateEntity,
    "undefined"
  );

  assert.equal(
    OAUTH_ORDERING_PARTITION_KEY,
    "OAUTH_ORDERING_PROOF_V1"
  );

  console.log(
    "OAuth ordering trusted read-only reconciliation tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
