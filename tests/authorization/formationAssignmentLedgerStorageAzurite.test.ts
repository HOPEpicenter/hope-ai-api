import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  FormationAssignmentLedgerStorageRepository
} from "../../src/repositories/formationAssignmentLedgerStorageRepository";

/**
 * Emulator-only, synthetic assignment-ledger proof.
 * Requires an explicitly selected local Azurite connection.
 * Creates and deletes one randomized test table.
 * Never uses production credentials or ministry data.
 *
 * A successful storage test does not establish
 * authorization readiness or complete writer participation.
 */

if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite-only storage required");
}

const port = process.env.HOPE_ASSIGNMENT_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved local Azurite Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

type Head = {
  visitorId: string;
  revision: number;
  kind: string;
  assigneeId: string;
  lastOperationId: string;
};

const visitorId = `synthetic-${randomUUID()}`;
const tableName = `AssignLedgerIT${randomBytes(8).toString("hex")}`;

const table = TableClient.fromConnectionString(
  connectionString,
  tableName,
  { allowInsecureConnection: true }
);

const repository = new FormationAssignmentLedgerStorageRepository(table);

const request = (
  operationId: string,
  expectedRevision: number,
  kind: "assigned" | "unassigned",
  assigneeId?: string
) => ({
  visitorId,
  operationId,
  expectedRevision,
  kind,
  ...(assigneeId === undefined ? {} : { assigneeId })
});

async function readHead() {
  return table.getEntity<Head>(visitorId, "ordering-head");
}

async function readReceipts(): Promise<Array<{ operationId: string }>> {
  const receipts: Array<{ operationId: string }> = [];

  for await (const entity of table.listEntities<{
    operationId?: string
  }>({
    queryOptions: {
      filter: `PartitionKey eq '${visitorId}'`
    }
  })) {
    if (typeof entity.operationId === "string") {
      receipts.push({ operationId: entity.operationId });
    }
  }

  return receipts;
}

async function main(): Promise<void> {
  await table.createTable();

  try {
    const firstId = randomUUID();
    const first = await repository.append(
      request(firstId, 0, "assigned", "synthetic-staff-A")
    );

    assert.equal(first.status, "committed");
    assert.equal(first.revision, 1);
    assert.equal(first.authorizationPermitted, false);
    assert.equal(first.retryPermitted, false);
    assert.equal((await readHead()).revision, 1);
    assert.equal((await readReceipts()).length, 1);

    console.log("[PASS] Atomic first-write initialization");

    const replay = await repository.append(
      request(firstId, 0, "assigned", "synthetic-staff-A")
    );

    assert.equal(replay.status, "replay");
    assert.equal((await readHead()).revision, 1);
    assert.equal((await readReceipts()).length, 1);

    console.log("[PASS] Duplicate operation rejected");

    const stale = await repository.append(
      request(randomUUID(), 0, "assigned", "synthetic-staff-B")
    );

    assert.equal(stale.status, "conflict");
    assert.equal((await readHead()).revision, 1);

    console.log("[PASS] Stale revision rejected");

    const secondId = randomUUID();
    const second = await repository.append(
      request(secondId, 1, "unassigned")
    );

    assert.equal(second.status, "committed");
    assert.equal(second.revision, 2);
    assert.equal((await readHead()).revision, 2);
    assert.equal((await readHead()).kind, "unassigned");
    assert.equal((await readReceipts()).length, 2);

    console.log("[PASS] Atomic sequential assignment transition");

    const competingIds = Array.from(
      { length: 12 },
      () => randomUUID()
    );

    const competing = await Promise.all(
      competingIds.map(operationId =>
        repository.append(
          request(operationId, 2, "assigned", "synthetic-staff-C")
        )
      )
    );

    assert.equal(
      competing.filter(result => result.status === "committed").length,
      1
    );

    assert.equal(
      competing.every(result =>
        result.status === "committed" ||
        result.status === "conflict"
      ),
      true
    );

    assert.equal((await readHead()).revision, 3);
    assert.equal((await readReceipts()).length, 3);

    console.log("[PASS] Concurrent updates admit one winner");

    // Force the second action of a direct same-partition batch
    // to fail. The head update must roll back atomically.
    const beforeRollback = await readHead();
    const duplicateReceipt = `operation-${firstId}`;

    const failingBatch: TransactionAction[] = [
      [
        "update",
        {
          partitionKey: visitorId,
          rowKey: "ordering-head",
          visitorId,
          revision: 4,
          kind: "unassigned",
          assigneeId: "",
          lastOperationId: "synthetic-rollback"
        },
        "Replace",
        { etag: beforeRollback.etag }
      ],
      [
        "create",
        {
          partitionKey: visitorId,
          rowKey: duplicateReceipt,
          operationId: firstId,
          revision: 4
        }
      ]
    ];

    let rollbackRejected = false;

    try {
      await table.submitTransaction(failingBatch);
    } catch {
      rollbackRejected = true;
    }

    assert.equal(rollbackRejected, true);
    assert.equal((await readHead()).revision, 3);
    assert.equal((await readReceipts()).length, 3);

    console.log("[PASS] Failed batch rolls back head update");

    // Simulate transport acknowledgment loss AFTER a real
    // successful local transaction.
    const uncertainId = randomUUID();

    const lostAckTable = {
      getEntity: table.getEntity.bind(table),
      submitTransaction: async (
        actions: TransactionAction[]
      ) => {
        await table.submitTransaction(actions);
        throw new Error("synthetic_lost_acknowledgement");
      }
    } as unknown as TableClient;

    const uncertainRepository =
      new FormationAssignmentLedgerStorageRepository(lostAckTable);

    const uncertain = await uncertainRepository.append(
      request(uncertainId, 3, "assigned", "synthetic-staff-D")
    );

    assert.equal(uncertain.status, "uncertain");
    assert.equal(uncertain.authorizationPermitted, false);
    assert.equal(uncertain.retryPermitted, false);

    // Inspect durable synthetic evidence without retrying.
    assert.equal((await readHead()).revision, 4);
    assert.equal((await readReceipts()).length, 4);

    const receipt = await table.getEntity<{
      operationId: string;
      revision: number;
    }>(visitorId, `operation-${uncertainId}`);

    assert.equal(receipt.operationId, uncertainId);
    assert.equal(receipt.revision, 4);

    console.log("[PASS] Lost acknowledgment remains non-authorizing");
    // Inspect evidence only: these reads cannot authorize access.
    const currentEvidence = await repository.inspectOperation(
      request(uncertainId, 3, "assigned", "synthetic-staff-D")
    );

    assert.equal(currentEvidence.status, "observed_current");
    assert.equal(currentEvidence.authorizationPermitted, false);
    assert.equal(currentEvidence.retryPermitted, false);

    const historicalEvidence = await repository.inspectOperation(
      request(firstId, 0, "assigned", "synthetic-staff-A")
    );

    assert.equal(historicalEvidence.status, "observed_historical");
    assert.equal(historicalEvidence.authorizationPermitted, false);
    assert.equal(historicalEvidence.retryPermitted, false);

    const missingEvidence = await repository.inspectOperation(
      request(randomUUID(), 4, "unassigned")
    );

    assert.equal(missingEvidence.status, "absent_or_unavailable");
    assert.equal(missingEvidence.authorizationPermitted, false);
    assert.equal(missingEvidence.retryPermitted, false);

    const mismatchedEvidence = await repository.inspectOperation(
      request(firstId, 0, "assigned", "synthetic-staff-wrong")
    );

    assert.equal(mismatchedEvidence.status, "inconsistent");
    assert.equal(mismatchedEvidence.authorizationPermitted, false);
    assert.equal(mismatchedEvidence.retryPermitted, false);

    const invalidEvidence = await repository.inspectOperation({
      visitorId,
      operationId: "invalid-operation",
      expectedRevision: -1,
      kind: "assigned",
      assigneeId: "synthetic-staff-A"
    });

    assert.equal(invalidEvidence.status, "inconsistent");
    assert.equal(invalidEvidence.authorizationPermitted, false);
    assert.equal(invalidEvidence.retryPermitted, false);

    // An ambiguous acknowledgement can later have durable
    // historical evidence, but does not permit retry or access.
    assert.equal(uncertain.status, "uncertain");
    assert.equal(currentEvidence.authorizationPermitted, false);
    assert.equal(currentEvidence.retryPermitted, false);

    // Two simultaneous requests with the SAME operation ID.
    // Both contenders use the same current expected revision.
    // Exactly one transaction may commit; the other must
    // fail closed as conflict or replay.
    const sharedOperationId = randomUUID();

    const sharedRequest = request(
      sharedOperationId,
      4,
      "assigned",
      "synthetic-staff-E"
    );

    const [sharedA, sharedB] = await Promise.all([
      repository.append(sharedRequest),
      repository.append(sharedRequest)
    ]);

    const sharedStatuses = [sharedA.status, sharedB.status];

    assert.equal(
      sharedStatuses.filter(status => status === "committed").length,
      1
    );

    assert.equal(
      sharedStatuses.every(status =>
        status === "committed" ||
        status === "conflict" ||
        status === "replay"
      ),
      true
    );

    assert.equal((await readHead()).revision, 5);

    const allReceipts = await readReceipts();

    assert.equal(allReceipts.length, 5);

    assert.equal(
      allReceipts.filter(
        receipt => receipt.operationId === sharedOperationId
      ).length,
      1
    );

    const sharedEvidence = await repository.inspectOperation(
      sharedRequest
    );

    assert.equal(sharedEvidence.status, "observed_current");
    assert.equal(sharedEvidence.authorizationPermitted, false);
    assert.equal(sharedEvidence.retryPermitted, false);

    console.log("[PASS] Same-operation-ID concurrent race passed");
    console.log("[PASS] Reconciliation evidence assertions passed");
    // Synthetic storage doubles: no network calls or table writes.
    // A malformed persisted head must fail closed in both paths.
    const corruptHeads = [
      {
        label: "assigned without assignee",
        kind: "assigned",
        assigneeId: "",
        lastOperationId: "synthetic-previous"
      },
      {
        label: "unassigned with assignee",
        kind: "unassigned",
        assigneeId: "synthetic-staff-X",
        lastOperationId: "synthetic-previous"
      },
      {
        label: "invalid stored operation ID",
        kind: "assigned",
        assigneeId: "synthetic-staff-X",
        lastOperationId: "invalid operation id"
      }
    ] as const;

    for (const corrupt of corruptHeads) {
      const probeId = randomUUID();
      const probeRequest = request(
        probeId,
        1,
        "assigned",
        "synthetic-staff-Y"
      );

      let writeAttempts = 0;

      const corruptTable = {
        getEntity: async (
          partitionKey: string,
          rowKey: string
        ): Promise<any> => {
          assert.equal(partitionKey, visitorId);

          if (rowKey === `operation-${probeId}`) {
            // For inspection, provide a valid immutable receipt.
            // For append, model a missing receipt using a switch.
            if (inspectionMode) {
              return {
                visitorId,
                operationId: probeId,
                expectedRevision: 1,
                revision: 2,
                kind: "assigned",
                assigneeId: "synthetic-staff-Y"
              };
            }

            throw Object.assign(new Error("synthetic_not_found"), {
              statusCode: 404
            });
          }

          assert.equal(rowKey, "ordering-head");

          return {
            visitorId,
            revision: 2,
            kind: corrupt.kind,
            assigneeId: corrupt.assigneeId,
            lastOperationId: corrupt.lastOperationId,
            etag: 'W/"synthetic-etag"'
          };
        },
        submitTransaction: async () => {
          writeAttempts++;
          throw new Error("unexpected_write");
        }
      } as unknown as TableClient;

      let inspectionMode = false;

      const corruptRepository =
        new FormationAssignmentLedgerStorageRepository(corruptTable);

      const appendResult = await corruptRepository.append(
        request(probeId, 2, "assigned", "synthetic-staff-Y")
      );

      assert.equal(appendResult.status, "unavailable", corrupt.label);
      assert.equal(appendResult.authorizationPermitted, false);
      assert.equal(appendResult.retryPermitted, false);
      assert.equal(writeAttempts, 0);

      inspectionMode = true;

      const evidence = await corruptRepository.inspectOperation(
        probeRequest
      );

      assert.equal(evidence.status, "inconsistent", corrupt.label);
      assert.equal(evidence.authorizationPermitted, false);
      assert.equal(evidence.retryPermitted, false);
      assert.equal(writeAttempts, 0);
    }

    console.log("[PASS] Corrupted ledger-head regression assertions passed");
    console.log("[PASS] All synthetic ledger atomicity assertions");
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});