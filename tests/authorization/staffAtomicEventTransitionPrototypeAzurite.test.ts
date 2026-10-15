import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD,
  STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION,
  StaffAtomicEventTransitionPrototypeRepository
} from "../../src/repositories/staffAtomicEventTransitionPrototypeRepository";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";

if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw new Error("Azurite-only storage required");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

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

function table(): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    "StaffAtomicIT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
}

function event(eventId: string): StaffEvent {
  return {
    eventId,
    staffId: "synthetic-staff",
    type: "staff.activated",
    occurredAt: "2026-10-15T00:00:00.000Z",
    actorId: "synthetic-actor",
    data: { status: "active" }
  };
}

function request(
  operationId: string,
  eventId: string,
  expectedRevision: number
) {
  return {
    operationId,
    expectedRevision,
    event: event(eventId)
  };
}

function nonAuthorizing(result: {
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
}

async function revision(client: TableClient): Promise<number> {
  const head = await client.getEntity<{ revision: number }>(
    STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION,
    STAFF_ATOMIC_EVENT_PROTOTYPE_HEAD
  );
  return head.revision;
}

async function missing(client: TableClient, rowKey: string): Promise<void> {
  await assert.rejects(
    client.getEntity(STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION, rowKey)
  );
}

function proxy(
  client: TableClient,
  intercept: (
    actions: TransactionAction[],
    submit: (actions: TransactionAction[]) => Promise<unknown>
  ) => Promise<unknown>
): TableClient {
  return new Proxy(client, {
    get(target, property) {
      if (property === "submitTransaction") {
        const submit = target.submitTransaction.bind(target) as (
          actions: TransactionAction[]
        ) => Promise<unknown>;
        return (actions: TransactionAction[]) =>
          intercept(actions, submit);
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function"
        ? value.bind(target)
        : value;
    }
  });
}

async function scenario(
  run: (
    client: TableClient,
    repo: StaffAtomicEventTransitionPrototypeRepository
  ) => Promise<void>
): Promise<void> {
  const client = table();
  await client.createTable();
  try {
    const repo = new StaffAtomicEventTransitionPrototypeRepository(client);
    assert.equal(await repo.initializeHead(), "initialized");
    assert.equal(await repo.initializeHead(), "conflict");
    await run(client, repo);
  } finally {
    await client.deleteTable();
  }
}

async function main(): Promise<void> {
  // Same ETag and same expected revision: exactly one transaction wins.
  await scenario(async (client, repo) => {
    const results = await Promise.all([
      repo.commit(request("race-op-a", "race-event-a", 0)),
      repo.commit(request("race-op-b", "race-event-b", 0))
    ]);

    assert.equal(results.filter(x => x.status === "committed").length, 1);
    assert.equal(
      results.filter(x =>
        x.status === "conflict" || x.status === "rejected"
      ).length,
      1
    );

    results.forEach(nonAuthorizing);
    assert.equal(await revision(client), 1);

    let count = 0;
    for await (const entity of client.listEntities<{
      rowKey: string;
    }>({
      queryOptions: {
        filter: `PartitionKey eq '${STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION}'`
      }
    })) {
      if (entity.rowKey.startsWith("event-")) count++;
    }
    assert.equal(count, 1);
  });

  // Stale revision must not create any event or receipt.
  await scenario(async (client, repo) => {
    const first = await repo.commit(request("first-op", "first-event", 0));
    assert.equal(first.status, "committed");
    nonAuthorizing(first);

    const stale = await repo.commit(request("stale-op", "stale-event", 0));
    assert.equal(stale.status, "rejected");
    nonAuthorizing(stale);

    assert.equal(await revision(client), 1);
    await missing(client, "event-stale-event");
    await missing(client, "operation-stale-op");
  });

  // Reused operation ID must roll back event creation and head update.
  await scenario(async (client, repo) => {
    assert.equal(
      (await repo.commit(request("duplicate-op", "original-event", 0))).status,
      "committed"
    );

    const duplicate = await repo.commit(
      request("duplicate-op", "different-event", 1)
    );

    assert.equal(duplicate.status, "conflict");
    nonAuthorizing(duplicate);
    assert.equal(await revision(client), 1);
    await missing(client, "event-different-event");
  });

  // Reused event ID must roll back receipt creation and head update.
  await scenario(async (client, repo) => {
    assert.equal(
      (await repo.commit(request("original-op", "duplicate-event", 0))).status,
      "committed"
    );

    const duplicate = await repo.commit(
      request("different-op", "duplicate-event", 1)
    );

    assert.equal(duplicate.status, "conflict");
    nonAuthorizing(duplicate);
    assert.equal(await revision(client), 1);
    await missing(client, "operation-different-op");
  });

  // Failed transaction: no partial rows or head advancement.
  await scenario(async (client) => {
    let submissions = 0;
    const failedRepo = new StaffAtomicEventTransitionPrototypeRepository(
      proxy(client, async () => {
        submissions++;
        throw { statusCode: 409 };
      })
    );

    const failed = await failedRepo.commit(
      request("failed-op", "failed-event", 0)
    );

    assert.equal(failed.status, "conflict");
    nonAuthorizing(failed);
    assert.equal(submissions, 1);
    assert.equal(await revision(client), 0);
    await missing(client, "event-failed-event");
    await missing(client, "operation-failed-op");
  });

  // Commit succeeded, but acknowledgement was lost.
  // The result must remain uncertain and never authorize retry.
  await scenario(async (client) => {
    let submissions = 0;
    const uncertainRepo = new StaffAtomicEventTransitionPrototypeRepository(
      proxy(client, async (actions, submit) => {
        submissions++;
        await submit(actions);
        throw new Error("synthetic acknowledgement lost");
      })
    );

    const uncertain = await uncertainRepo.commit(
      request("uncertain-op", "uncertain-event", 0)
    );

    assert.equal(uncertain.status, "uncertain");
    nonAuthorizing(uncertain);
    assert.equal(submissions, 1);
    assert.equal(await revision(client), 1);

    const storedEvent = await client.getEntity<{
      operationId: string;
      eventId: string;
    }>(
      STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION,
      "event-uncertain-event"
    );

    assert.equal(storedEvent.operationId, "uncertain-op");
    assert.equal(storedEvent.eventId, "uncertain-event");

    const receipt = await client.getEntity<{
      operationId: string;
      revision: number;
    }>(
      STAFF_ATOMIC_EVENT_PROTOTYPE_PARTITION,
      "operation-uncertain-op"
    );

    assert.equal(receipt.operationId, "uncertain-op");
    assert.equal(receipt.revision, 1);
  });

  console.log("staffAtomicEventTransitionPrototypeAzurite.test.ts passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
