import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";

/**
 * Emulator-only staff-writer participation feasibility.
 * No production repositories, Entra identities, or
 * credential execution are used by this test.
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

type Head = {
  revision: number;
  state: string;
};

type StoredEvent = {
  eventId?: string;
  staffId?: string;
  kind?: string;
};

const executionPermitted = false;
const retryPermitted = false;

async function main(): Promise<void> {
  const name =
    "OauthStaffIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    name,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  const bindingPartition = randomUUID();
  const orderingPartition = randomUUID();
  const bindingRow = "binding-reservation";
  const headRow = "ordering-head";

  async function readHead(partition: string) {
    return table.getEntity<Head>(partition, headRow);
  }

  async function readEvents(
    partition: string
  ): Promise<StoredEvent[]> {
    const events: StoredEvent[] = [];

    for await (const entity of table.listEntities<StoredEvent>({
      queryOptions: {
        filter: `PartitionKey eq '${partition}'`
      }
    })) {
      if (typeof entity.eventId === "string") {
        events.push({
          eventId: entity.eventId,
          staffId: entity.staffId,
          kind: entity.kind
        });
      }
    }

    return events;
  }

  function eventCreate(
    partition: string,
    eventId: string,
    staffId: string,
    kind: string
  ): TransactionAction {
    return [
      "create",
      {
        partitionKey: partition,
        rowKey: `event-${eventId}`,
        eventId,
        staffId,
        kind
      }
    ];
  }

  try {
    await table.createEntity({
      partitionKey: bindingPartition,
      rowKey: headRow,
      revision: 0,
      state: "unassigned"
    });

    // One global synthetic coordination partition.
    // All contestants use the same head ETag and
    // attempt to create the same binding reservation.
    const initial = await readHead(bindingPartition);
    const contestants = Array.from(
      { length: 20 },
      () => ({
        staffId: randomUUID(),
        eventId: randomUUID()
      })
    );

    const results = await Promise.all(
      contestants.map(async candidate => {
        const actions: TransactionAction[] = [
          [
            "update",
            {
              partitionKey: bindingPartition,
              rowKey: headRow,
              revision: 1,
              state: "assigned"
            },
            "Replace",
            { etag: initial.etag }
          ],
          [
            "create",
            {
              partitionKey: bindingPartition,
              rowKey: bindingRow,
              staffId: candidate.staffId,
              bindingKey: "synthetic-entra-binding"
            }
          ],
          eventCreate(
            bindingPartition,
            candidate.eventId,
            candidate.staffId,
            "staff.binding_assigned"
          )
        ];

        try {
          await table.submitTransaction(actions);
          return candidate.staffId;
        } catch {
          return null;
        }
      })
    );

    const winners = results.filter(
      (staffId): staffId is NonNullable<typeof staffId> => staffId !== null
    );

    assert.equal(
      winners.length,
      1,
      "Exactly one binding writer must commit"
    );

    const assigned = await readHead(bindingPartition);
    const reservation = await table.getEntity<{
      staffId: string;
    }>(bindingPartition, bindingRow);
    const bindingEvents = await readEvents(bindingPartition);

    assert.equal(assigned.revision, 1);
    assert.equal(assigned.state, "assigned");
    assert.equal(reservation.staffId, winners[0]);
    assert.equal(bindingEvents.length, 1);
    assert.equal(bindingEvents[0].staffId, winners[0]);

    console.log(
      "Concurrent Entra binding reservation passed"
    );

    // With a fresh ETag, deliberately fail the second
    // action by trying to create the existing reservation.
    const beforeDuplicate = await readHead(bindingPartition);
    const duplicateEventId = randomUUID();

    let duplicateRejected = false;

    try {
      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: bindingPartition,
            rowKey: headRow,
            revision: 2,
            state: "reassigned"
          },
          "Replace",
          { etag: beforeDuplicate.etag }
        ],
        [
          "create",
          {
            partitionKey: bindingPartition,
            rowKey: bindingRow,
            staffId: randomUUID(),
            bindingKey: "synthetic-entra-binding"
          }
        ],
        eventCreate(
          bindingPartition,
          duplicateEventId,
          randomUUID(),
          "staff.binding_reassigned"
        )
      ]);
    } catch (error) {
      const status = (error as {
        statusCode?: number;
      }).statusCode;
      duplicateRejected = status === 409 || status === 412;
    }

    assert.equal(duplicateRejected, true);
    assert.equal((await readHead(bindingPartition)).revision, 1);
    assert.equal((await readEvents(bindingPartition)).length, 1);
    assert.equal(
      (
        await table.getEntity<{ staffId: string }>(
          bindingPartition,
          bindingRow
        )
      ).staffId,
      winners[0]
    );

    console.log(
      "Duplicate binding transactional rollback passed"
    );

    // An independent synthetic ordering partition
    // demonstrates claim-vs-revocation contention.
    await table.createEntity({
      partitionKey: orderingPartition,
      rowKey: headRow,
      revision: 0,
      state: "active"
    });

    const orderingInitial = await readHead(orderingPartition);

    function orderingActions(
      kind: "oauth.claimed" | "staff.deactivated",
      eventId: string
    ): TransactionAction[] {
      return [
        [
          "update",
          {
            partitionKey: orderingPartition,
            rowKey: headRow,
            revision: 1,
            state: kind === "oauth.claimed"
              ? "claim_recorded"
              : "revoked"
          },
          "Replace",
          { etag: orderingInitial.etag }
        ],
        eventCreate(
          orderingPartition,
          eventId,
          winners[0],
          kind
        )
      ];
    }

    const contenders = [
      {
        kind: "oauth.claimed" as const,
        eventId: randomUUID()
      },
      {
        kind: "staff.deactivated" as const,
        eventId: randomUUID()
      }
    ];

    const orderingResults = await Promise.all(
      contenders.map(async contender => {
        try {
          await table.submitTransaction(
            orderingActions(
              contender.kind,
              contender.eventId
            )
          );
          return contender.kind;
        } catch {
          return null;
        }
      })
    );

    const committed = orderingResults.filter(
      (kind): kind is "oauth.claimed" | "staff.deactivated" =>
        kind !== null
    );

    assert.equal(committed.length, 1);

    const afterRace = await readHead(orderingPartition);
    const afterRaceEvents = await readEvents(orderingPartition);

    assert.equal(afterRace.revision, 1);
    assert.equal(afterRaceEvents.length, 1);
    assert.equal(afterRaceEvents[0].kind, committed[0]);

    console.log(
      "Deactivation versus claim ETag race passed"
    );

    if (committed[0] === "oauth.claimed") {
      // A committed claim is not an external execution grant.
      // The synthetic model records pending revocation.
      const beforePending = await readHead(orderingPartition);

      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: orderingPartition,
            rowKey: headRow,
            revision: 2,
            state: "revocation_pending"
          },
          "Replace",
          { etag: beforePending.etag }
        ],
        eventCreate(
          orderingPartition,
          randomUUID(),
          winners[0],
          "staff.revocation_pending"
        )
      ]);

      assert.equal(
        (await readHead(orderingPartition)).state,
        "revocation_pending"
      );
      assert.equal(
        (await readEvents(orderingPartition)).length,
        2
      );
    } else {
      assert.equal(afterRace.state, "revoked");
    }

    assert.equal(executionPermitted, false);
    assert.equal(retryPermitted, false);

    console.log(
      "Claim-before-revocation fail-closed handling passed"
    );

    // Ambiguous result: commit occurs, but caller loses
    // the acknowledgement. Durable evidence is reread;
    // this does not authorize retry or execution.
    const beforeUncertain = await readHead(bindingPartition);
    const uncertainId = randomUUID();

    let uncertain = false;

    try {
      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: bindingPartition,
            rowKey: headRow,
            revision: 2,
            state: "inspection_required"
          },
          "Replace",
          { etag: beforeUncertain.etag }
        ],
        eventCreate(
          bindingPartition,
          uncertainId,
          winners[0],
          "staff.synthetic_inspection"
        )
      ]);

      throw new Error("synthetic_lost_acknowledgement");
    } catch {
      uncertain = true;
    }

    assert.equal(uncertain, true);

    const inspectedHead = await readHead(bindingPartition);
    const inspectedEvents = await readEvents(bindingPartition);

    assert.equal(inspectedHead.revision, 2);
    assert.equal(
      inspectedEvents.filter(
        event => event.eventId === uncertainId
      ).length,
      1
    );
    assert.equal(executionPermitted, false);
    assert.equal(retryPermitted, false);

    console.log(
      "Ambiguous acknowledgement durable inspection passed"
    );

    console.log(
      "OAuth staff writer participation Azurite proof passed"
    );
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
