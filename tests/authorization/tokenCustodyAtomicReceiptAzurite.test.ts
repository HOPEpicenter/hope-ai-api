import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction,
} from "@azure/data-tables";

import {
  planTokenCustodyAtomicReceipt,
  type CustodyAtomicReceiptAction,
} from "../../src/services/authorization/planTokenCustodyAtomicReceipt";

import {
  submitSyntheticCustodyAtomicReceipt,
  type SyntheticCustodyTransactionPort,
} from "../../src/repositories/tokenCustodyAtomicReceiptAdapter";

import {
  TOKEN_CUSTODY_PARTITION_KEY,
} from "../../src/repositories/tokenCustodyMetadataRepository";

/**
 * Emulator-only proof of the custody-specific action mapping.
 * No cloud access, credentials, HTTP routes, or feature activation.
 */
if (
  process.env.STORAGE_CONNECTION_STRING !==
  "UseDevelopmentStorage=true" ||
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002"
) {
  throw new Error("Isolated Azurite Table configuration required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1",
].join(";");

const tableName = "CustodyAtomicIT" +
  randomBytes(8).toString("hex");

const table = TableClient.fromConnectionString(
  connectionString,
  tableName,
  { allowInsecureConnection: true },
);

const partition = TOKEN_CUSTODY_PARTITION_KEY;

type Snapshot = {
  recordId: string;
  revision: number;
  rotationRevision: number;
  revocationRevision: number;
  state: "active" | "revoked" | "uncertain";
  accessExpiresAtMs: number;
};

function initialSnapshot(recordId: string): Snapshot {
  return {
    recordId,
    revision: 3,
    rotationRevision: 2,
    revocationRevision: 0,
    state: "active",
    accessExpiresAtMs: 1000,
  };
}

async function initialize(recordId: string) {
  const snapshot = initialSnapshot(recordId);

  await table.createEntity({
    partitionKey: partition,
    rowKey: recordId,
    snapshotJson: JSON.stringify(snapshot),
  });

  return table.getEntity<{ snapshotJson: string }>(
    partition, recordId,
  );
}

function plan(
  recordId: string,
  etag: string,
  snapshot: Snapshot,
  receiptId = randomUUID(),
) {
  return planTokenCustodyAtomicReceipt({
    recordId,
    etag,
    receiptId,
    snapshot,
    command: {
      action: "rotate",
      expectedRevision: snapshot.revision,
      expectedRotationRevision: snapshot.rotationRevision,
      expectedRevocationRevision: snapshot.revocationRevision,
      authorized: true,
      executionEnabled: true,
      nextAccessExpiresAtMs: snapshot.accessExpiresAtMs + 1000,
    },
  });
}

function toSdkActions(
  actions: readonly [
    CustodyAtomicReceiptAction,
    CustodyAtomicReceiptAction,
  ],
): TransactionAction[] {
  const [update, create] = actions;

  if (
    update.kind !== "update" ||
    create.kind !== "create" ||
    update.partitionKey !== partition ||
    create.partitionKey !== partition
  ) {
    throw new Error("Invalid custody test transaction");
  }

  return [
    [
      "update",
      {
        partitionKey: update.partitionKey,
        rowKey: update.rowKey,
        snapshotJson: update.snapshotJson,
      },
      "Replace",
      { etag: update.etag },
    ],
    [
      "create",
      {
        partitionKey: create.partitionKey,
        rowKey: create.rowKey,
        receiptJson: create.receiptJson,
      },
    ],
  ];
}

const port: SyntheticCustodyTransactionPort = {
  async submitTransaction(actions) {
    await table.submitTransaction(toSdkActions(actions));
  },
};

async function readSnapshot(recordId: string): Promise<Snapshot> {
  const entity = await table.getEntity<{ snapshotJson: string }>(
    partition, recordId,
  );
  return JSON.parse(entity.snapshotJson) as Snapshot;
}

async function receiptCount(recordId: string): Promise<number> {
  let count = 0;

  for await (const entity of table.listEntities<{
    receiptJson?: string;
  }>({
    queryOptions: {
      filter: `PartitionKey eq '${partition}'`,
    },
  })) {
    if (
      typeof entity.rowKey === "string" && entity.rowKey.startsWith("audit-") &&
      typeof entity.receiptJson === "string"
    ) {
      const receipt = JSON.parse(entity.receiptJson) as {
        recordId?: string;
      };
      if (receipt.recordId === recordId) count++;
    }
  }

  return count;
}

async function main(): Promise<void> {
  await table.createTable();

  try {
    // Competing writers submit the exact custody action shape.
    const raceId = "race-" + randomUUID();
    const raceInitial = await initialize(raceId);
    const raceSnapshot = JSON.parse(
      raceInitial.snapshotJson,
    ) as Snapshot;

    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        submitSyntheticCustodyAtomicReceipt(
          plan(raceId, raceInitial.etag, raceSnapshot),
          port,
          true,
        )
      )
    );

    assert.equal(
      attempts.filter(x => x.outcome === "committed").length,
      1,
    );
    assert.equal(attempts.some(x => x.executionPermitted), false);
    assert.equal(attempts.some(x => x.retryPermitted), false);
    assert.equal((await readSnapshot(raceId)).revision, 4);
    assert.equal(await receiptCount(raceId), 1);
    console.log("PASS custody concurrent atomic commit");

    // Stale ETag must not create a second audit receipt.
    const stale = await submitSyntheticCustodyAtomicReceipt(
      plan(raceId, raceInitial.etag, raceSnapshot),
      port,
      true,
    );

    assert.equal(stale.outcome, "denied");
    assert.equal((await readSnapshot(raceId)).revision, 4);
    assert.equal(await receiptCount(raceId), 1);
    console.log("PASS custody stale ETag rollback");

    // Duplicate receipt must roll back a valid metadata update.
    const duplicateId = "duplicate-" + randomUUID();
    const duplicateInitial = await initialize(duplicateId);
    const fixedReceipt = randomUUID();

    const first = await submitSyntheticCustodyAtomicReceipt(
      plan(
        duplicateId,
        duplicateInitial.etag,
        initialSnapshot(duplicateId),
        fixedReceipt,
      ),
      port,
      true,
    );

    assert.equal(first.outcome, "committed");

    const current = await table.getEntity<{
      snapshotJson: string;
    }>(partition, duplicateId);

    const duplicateAttempt = await submitSyntheticCustodyAtomicReceipt(
      plan(
        duplicateId,
        current.etag,
        JSON.parse(current.snapshotJson) as Snapshot,
        fixedReceipt,
      ),
      port,
      true,
    );

    assert.notEqual(duplicateAttempt.outcome, "committed");
    assert.equal((await readSnapshot(duplicateId)).revision, 4);
    assert.equal(await receiptCount(duplicateId), 1);
    console.log("PASS custody duplicate receipt rollback");

    // Simulate successful durable commit followed by lost ACK.
    const uncertainId = "uncertain-" + randomUUID();
    const uncertainInitial = await initialize(uncertainId);
    let submissions = 0;

    const ackLossPort: SyntheticCustodyTransactionPort = {
      async submitTransaction(actions) {
        submissions++;
        await table.submitTransaction(toSdkActions(actions));
        throw new Error("synthetic acknowledgement lost");
      },
    };

    const uncertain = await submitSyntheticCustodyAtomicReceipt(
      plan(
        uncertainId,
        uncertainInitial.etag,
        initialSnapshot(uncertainId),
      ),
      ackLossPort,
      true,
    );

    assert.equal(uncertain.outcome, "uncertain");
    assert.equal(submissions, 1);
    assert.equal(uncertain.executionPermitted, false);
    assert.equal(uncertain.retryPermitted, false);
    assert.equal((await readSnapshot(uncertainId)).revision, 4);
    assert.equal(await receiptCount(uncertainId), 1);
    console.log("PASS custody lost acknowledgement inspection");

    console.log("CUSTODY_AZURITE_ATOMICITY=4_OF_4_PASS");
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
