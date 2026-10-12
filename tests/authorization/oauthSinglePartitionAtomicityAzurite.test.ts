import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";

/**
 * Emulator-only same-partition atomicity feasibility proof.
 *
 * This does not modify StaffEvents, OAuth repositories,
 * identity data, or any external credential executor.
 */
if (
  process.env.STORAGE_CONNECTION_STRING !==
  "UseDevelopmentStorage=true"
) {
  throw new Error("Azurite-only storage required");
}

const port =
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved emulator Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

const partition = randomUUID();
const headKey = "ordering-head";

type OrderingHead = {
  revision: number;
  state: string;
};

type SyntheticEvent = {
  eventId: string;
  source: string;
};

async function main(): Promise<void> {
  const tableName =
    "OauthAtomicIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    await table.createEntity({
      partitionKey: partition,
      rowKey: headKey,
      revision: 0,
      state: "idle"
    });

    async function readHead() {
      return table.getEntity<OrderingHead>(
        partition,
        headKey
      );
    }

    async function events(): Promise<SyntheticEvent[]> {
      const result: SyntheticEvent[] = [];

      for await (const entity of table.listEntities<{
        eventId?: string;
        source?: string;
      }>({
        queryOptions: {
          filter: `PartitionKey eq '${partition}'`
        }
      })) {
        if (
          typeof entity.eventId === "string" &&
          typeof entity.source === "string"
        ) {
          result.push({
            eventId: entity.eventId,
            source: entity.source
          });
        }
      }

      return result;
    }

    function actions(
      etag: string,
      revision: number,
      eventId: string
    ): TransactionAction[] {
      return [
        [
          "update",
          {
            partitionKey: partition,
            rowKey: headKey,
            revision,
            state: "revoked"
          },
          "Replace",
          { etag }
        ],
        [
          "create",
          {
            partitionKey: partition,
            rowKey: `event-${eventId}`,
            eventId,
            source: "staff_deactivation",
            revision
          }
        ]
      ];
    }

    // Real concurrent SDK requests. Each contender
    // uses the same initial ETag.
    const initial = await readHead();
    const attempts: string[] = Array.from(
      { length: 20 },
      () => randomUUID()
    );

    const results = await Promise.all(
      attempts.map(async eventId => {
        try {
          await table.submitTransaction(
            actions(initial.etag, 1, eventId)
          );
          return true;
        } catch {
          return false;
        }
      })
    );

    assert.equal(
      results.filter(Boolean).length,
      1,
      "Exactly one competing transactional batch must commit"
    );

    const afterRace = await readHead();
    const committedEvents = await events();

    assert.equal(afterRace.revision, 1);
    assert.equal(afterRace.state, "revoked");
    assert.equal(committedEvents.length, 1);

    assert.ok(
      attempts.includes(committedEvents[0].eventId)
    );

    console.log(
      "Single-partition concurrent atomic commit passed"
    );

    // Explicitly try a stale ETag with a new event.
    let staleRejected = false;

    try {
      await table.submitTransaction(
        actions(initial.etag, 2, randomUUID())
      );
    } catch (error) {
      const status = (error as {
        statusCode?: number;
      }).statusCode;

      staleRejected =
        status === 412 || status === 409;
    }

    assert.equal(staleRejected, true);
    assert.equal((await readHead()).revision, 1);
    assert.equal((await events()).length, 1);

    console.log(
      "Stale ETag transactional rollback passed"
    );

    // The second action fails because its row already
    // exists. The first action must also roll back.
    const beforeFailure = await readHead();
    const duplicateEventId = committedEvents[0].eventId;

    let duplicateRejected = false;

    try {
      await table.submitTransaction(
        actions(
          beforeFailure.etag,
          2,
          duplicateEventId
        )
      );
    } catch {
      duplicateRejected = true;
    }

    assert.equal(duplicateRejected, true);
    assert.equal((await readHead()).revision, 1);
    assert.equal((await events()).length, 1);

    console.log(
      "Failed second action rolls back head update passed"
    );

    // Simulate an acknowledgement lost AFTER the
    // emulator commits the transaction.
    const beforeAckLoss = await readHead();
    const uncertainAttemptId = randomUUID();

    async function loseAcknowledgement(): Promise<void> {
      await table.submitTransaction(
        actions(
          beforeAckLoss.etag,
          2,
          uncertainAttemptId
        )
      );

      throw new Error("synthetic_lost_acknowledgement");
    }

    let acknowledgementUncertain = false;

    try {
      await loseAcknowledgement();
    } catch {
      acknowledgementUncertain = true;
    }

    assert.equal(acknowledgementUncertain, true);

    // A thrown acknowledgement alone cannot distinguish
    // success from failure. Inspect durable evidence.
    const reconciledHead = await readHead();
    const reconciledEvents = await events();

    assert.equal(reconciledHead.revision, 2);
    assert.equal(reconciledEvents.length, 2);
    assert.equal(
      reconciledEvents.filter(
        e => e.eventId === uncertainAttemptId
      ).length,
      1
    );

    // Inspection here is evidence about this synthetic
    // batch, not permission to retry or execute OAuth.
    const executionPermitted = false;
    const retryPermitted = false;

    assert.equal(executionPermitted, false);
    assert.equal(retryPermitted, false);

    console.log(
      "Lost acknowledgement durable inspection passed"
    );

    console.log(
      "OAuth single-partition atomicity Azurite proof passed"
    );
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
