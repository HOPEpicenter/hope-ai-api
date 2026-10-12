import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";

/**
 * Isolated Azurite transaction-topology research.
 *
 * No production StaffEvents or OAuth repositories.
 * No live identities, claims, credentials or retries.
 * The legacy bypass is demonstrated, NOT prevented.
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
  throw new Error("Unapproved Azurite Table port");
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

type EventEntity = {
  eventId?: string;
  kind?: string;
  staffId?: string;
};

const executionPermitted = false;
const retryPermitted = false;

async function main(): Promise<void> {
  const tableName =
    "OauthTopologyIT" + randomBytes(10).toString("hex");
  const legacyName =
    "OauthLegacyIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  const legacy = TableClient.fromConnectionString(
    connectionString,
    legacyName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  let legacyCreated = false;

  const partition = randomUUID();
  const headRow = "ordering-head";
  const bindingRow = "binding-reservation";

  async function readHead() {
    return table.getEntity<Head>(partition, headRow);
  }

  async function readEvents(): Promise<EventEntity[]> {
    const events: EventEntity[] = [];

    for await (const entity of table.listEntities<EventEntity>({
      queryOptions: {
        filter: `PartitionKey eq '${partition}'`
      }
    })) {
      if (typeof entity.eventId === "string") {
        events.push(entity);
      }
    }

    return events;
  }

  function createEvent(
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
      partitionKey: partition,
      rowKey: headRow,
      revision: 0,
      state: "unassigned"
    });

    const initial = await readHead();

    const candidates = Array.from(
      { length: 12 },
      () => ({
        staffId: randomUUID(),
        eventId: randomUUID()
      })
    );

    const results = await Promise.all(
      candidates.map(async candidate => {
        try {
          await table.submitTransaction([
            [
              "update",
              {
                partitionKey: partition,
                rowKey: headRow,
                revision: 1,
                state: "bound_active"
              },
              "Replace",
              { etag: initial.etag }
            ],
            [
              "create",
              {
                partitionKey: partition,
                rowKey: bindingRow,
                staffId: candidate.staffId,
                bindingKey: "tenant-a|object-b"
              }
            ],
            createEvent(
              candidate.eventId,
              candidate.staffId,
              "staff.binding_assigned"
            )
          ]);

          return candidate.staffId;
        } catch {
          return null;
        }
      })
    );

    const winners = results.filter(
      (id): id is NonNullable<typeof id> => id !== null
    );

    assert.equal(winners.length, 1);

    const winner = winners[0];
    const binding = await table.getEntity<{
      staffId: string;
    }>(partition, bindingRow);

    assert.equal(binding.staffId, winner);
    assert.equal((await readHead()).revision, 1);
    assert.equal((await readEvents()).length, 1);

    console.log(
      "Integrated binding reservation and event atomicity passed"
    );

    // The claim and deactivation now compete against
    // the SAME head that admitted the binding.
    const beforeRace = await readHead();

    const transitions = [
      {
        kind: "oauth.claimed" as const,
        state: "claim_recorded"
      },
      {
        kind: "staff.deactivated" as const,
        state: "revoked"
      }
    ];

    const race = await Promise.all(
      transitions.map(async transition => {
        try {
          await table.submitTransaction([
            [
              "update",
              {
                partitionKey: partition,
                rowKey: headRow,
                revision: 2,
                state: transition.state
              },
              "Replace",
              { etag: beforeRace.etag }
            ],
            createEvent(
              randomUUID(),
              winner,
              transition.kind
            )
          ]);

          return transition.kind;
        } catch {
          return null;
        }
      })
    );

    const committed = race.filter(
      (kind): kind is "oauth.claimed" | "staff.deactivated" =>
        kind !== null
    );

    assert.equal(committed.length, 1);
    assert.equal((await readHead()).revision, 2);
    assert.equal((await readEvents()).length, 2);

    console.log(
      "Integrated claim and deactivation ordering passed"
    );

    // If claim wins, record pending revocation.
    // If deactivation wins, the head is revoked.
    if (committed[0] === "oauth.claimed") {
      const beforePending = await readHead();

      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: partition,
            rowKey: headRow,
            revision: 3,
            state: "revocation_pending"
          },
          "Replace",
          { etag: beforePending.etag }
        ],
        createEvent(
          randomUUID(),
          winner,
          "staff.revocation_pending"
        )
      ]);

      assert.equal(
        (await readHead()).state,
        "revocation_pending"
      );
    } else {
      assert.equal((await readHead()).state, "revoked");
    }

    // A stale claim cannot overwrite either result.
    const beforeStale = await readHead();
    const staleEventId = randomUUID();
    let staleRejected = false;

    try {
      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: partition,
            rowKey: headRow,
            revision: beforeStale.revision + 1,
            state: "unauthorized_claim"
          },
          "Replace",
          { etag: beforeRace.etag }
        ],
        createEvent(
          staleEventId,
          winner,
          "oauth.stale_claim"
        )
      ]);
    } catch (error) {
      const status =
        (error as { statusCode?: number }).statusCode;
      staleRejected = status === 409 || status === 412;
      if (!staleRejected) throw error;
    }

    assert.equal(staleRejected, true);
    assert.equal(
      (await readHead()).revision,
      beforeStale.revision
    );
    assert.equal(
      (await readEvents()).some(
        event => event.eventId === staleEventId
      ),
      false
    );

    console.log(
      "Stale claim transaction rollback passed"
    );

    // Deterministic claim-first sequence in the same
    // synthetic coordination authority as its revocation.
    const claimFirstPartition = randomUUID();

    await table.createEntity({
      partitionKey: claimFirstPartition,
      rowKey: headRow,
      revision: 0,
      state: "active"
    });

    const claimFirstHead =
      await table.getEntity<Head>(claimFirstPartition, headRow);

    const claimFirstEventId = randomUUID();

    await table.submitTransaction([
      [
        "update",
        {
          partitionKey: claimFirstPartition,
          rowKey: headRow,
          revision: 1,
          state: "claim_recorded"
        },
        "Replace",
        { etag: claimFirstHead.etag }
      ],
      [
        "create",
        {
          partitionKey: claimFirstPartition,
          rowKey: `event-${claimFirstEventId}`,
          eventId: claimFirstEventId,
          staffId: winner,
          kind: "oauth.claimed"
        }
      ]
    ]);

    const claimedHead =
      await table.getEntity<Head>(claimFirstPartition, headRow);

    assert.equal(claimedHead.revision, 1);
    assert.equal(claimedHead.state, "claim_recorded");

    const pendingEventId = randomUUID();

    await table.submitTransaction([
      [
        "update",
        {
          partitionKey: claimFirstPartition,
          rowKey: headRow,
          revision: 2,
          state: "revocation_pending"
        },
        "Replace",
        { etag: claimedHead.etag }
      ],
      [
        "create",
        {
          partitionKey: claimFirstPartition,
          rowKey: `event-${pendingEventId}`,
          eventId: pendingEventId,
          staffId: winner,
          kind: "staff.revocation_pending"
        }
      ]
    ]);

    const pendingHead =
      await table.getEntity<Head>(claimFirstPartition, headRow);

    assert.equal(pendingHead.revision, 2);
    assert.equal(pendingHead.state, "revocation_pending");

    console.log(
      "Deterministic claim-first pending revocation passed"
    );

    // Deterministic revocation-first sequence.
    const revokeFirstPartition = randomUUID();

    await table.createEntity({
      partitionKey: revokeFirstPartition,
      rowKey: headRow,
      revision: 0,
      state: "active"
    });

    const revokeInitial =
      await table.getEntity<Head>(revokeFirstPartition, headRow);

    const revokeEventId = randomUUID();

    await table.submitTransaction([
      [
        "update",
        {
          partitionKey: revokeFirstPartition,
          rowKey: headRow,
          revision: 1,
          state: "revoked"
        },
        "Replace",
        { etag: revokeInitial.etag }
      ],
      [
        "create",
        {
          partitionKey: revokeFirstPartition,
          rowKey: `event-${revokeEventId}`,
          eventId: revokeEventId,
          staffId: winner,
          kind: "staff.deactivated"
        }
      ]
    ]);

    const revokedHead =
      await table.getEntity<Head>(revokeFirstPartition, headRow);

    assert.equal(revokedHead.state, "revoked");

    const rejectedClaimId = randomUUID();
    let revokedClaimRejected = false;

    try {
      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: revokeFirstPartition,
            rowKey: headRow,
            revision: 2,
            state: "claim_recorded"
          },
          "Replace",
          { etag: revokeInitial.etag }
        ],
        [
          "create",
          {
            partitionKey: revokeFirstPartition,
            rowKey: `event-${rejectedClaimId}`,
            eventId: rejectedClaimId,
            staffId: winner,
            kind: "oauth.claimed"
          }
        ]
      ]);
    } catch (error) {
      const status =
        (error as { statusCode?: number }).statusCode;

      revokedClaimRejected =
        status === 409 || status === 412;

      if (!revokedClaimRejected) throw error;
    }

    assert.equal(revokedClaimRejected, true);

    const stillRevoked =
      await table.getEntity<Head>(revokeFirstPartition, headRow);

    assert.equal(stillRevoked.revision, 1);
    assert.equal(stillRevoked.state, "revoked");
    assert.equal(stillRevoked.etag, revokedHead.etag);

    await assert.rejects(
      table.getEntity(
        revokeFirstPartition,
        `event-${rejectedClaimId}`
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );

    console.log(
      "Deterministic revocation-first stale claim rollback passed"
    );

    // Replay an already committed event identity using
    // a fresh head ETag. The duplicate create must
    // roll back the head update as well.
    const replayInitial =
      await table.getEntity<Head>(claimFirstPartition, headRow);

    const replayId = claimFirstEventId;
    let replayRejected = false;

    try {
      await table.submitTransaction([
        [
          "update",
          {
            partitionKey: claimFirstPartition,
            rowKey: headRow,
            revision: replayInitial.revision + 1,
            state: "replayed_claim"
          },
          "Replace",
          { etag: replayInitial.etag }
        ],
        [
          "create",
          {
            partitionKey: claimFirstPartition,
            rowKey: `event-${replayId}`,
            eventId: replayId,
            staffId: winner,
            kind: "oauth.claimed"
          }
        ]
      ]);
    } catch (error) {
      const status =
        (error as { statusCode?: number }).statusCode;

      replayRejected = status === 409 || status === 412;

      if (!replayRejected) throw error;
    }

    assert.equal(replayRejected, true);

    const replayFinal =
      await table.getEntity<Head>(claimFirstPartition, headRow);

    assert.equal(replayFinal.revision, replayInitial.revision);
    assert.equal(replayFinal.state, replayInitial.state);
    assert.equal(replayFinal.etag, replayInitial.etag);

    console.log(
      "Duplicate event replay transaction rollback passed"
    );

    // A separate legacy table can still be written
    // independently. This proves a remaining bypass
    // capability, NOT its prevention.
    await legacy.createTable();
    legacyCreated = true;

    await legacy.createEntity({
      partitionKey: winner,
      rowKey: `legacy-${randomUUID()}`,
      eventId: randomUUID(),
      kind: "staff.deactivated",
      staffId: winner
    });

    assert.equal(
      (await readHead()).revision,
      beforeStale.revision
    );

    const legacyEvents: EventEntity[] = [];

    for await (const entity of legacy.listEntities<EventEntity>()) {
      legacyEvents.push(entity);
    }

    assert.equal(legacyEvents.length, 1);
    assert.equal(
      legacyEvents[0].kind,
      "staff.deactivated"
    );

    console.log(
      "Independent legacy writer bypass demonstrated as unresolved"
    );

    assert.equal(executionPermitted, false);
    assert.equal(retryPermitted, false);

    console.log(
      "Integrated OAuth topology Azurite prototype passed"
    );
  } finally {
    if (legacyCreated) {
      await legacy.deleteTable();
    }

    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
