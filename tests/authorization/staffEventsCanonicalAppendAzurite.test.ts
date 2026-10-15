import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";

/**
 * Synthetic Azurite-only storage proof.
 *
 * Uses the canonical StaffEvents entity shape and storage identity,
 * but deliberately does not access StaffEventsRepository or live writers.
 *
 * No authorization, retry, recovery, or migration decision is made here.
 */
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

type EventRow = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  staffId: string;
  type: StaffEvent["type"];
  occurredAt: string;
  actorId: string;
  dataJson: string;
};

function event(
  eventId: string,
  overrides: Partial<StaffEvent> = {}
): StaffEvent {
  return {
    eventId,
    staffId: "synthetic-staff-a",
    type: "staff.created",
    occurredAt: "2026-10-15T12:00:00.000Z",
    actorId: "synthetic-actor",
    data: { displayName: "Synthetic Staff" },
    ...overrides
  };
}

function entity(value: StaffEvent): EventRow {
  return {
    partitionKey: value.staffId,
    rowKey: `${value.occurredAt}__${value.eventId}`,
    eventId: value.eventId,
    staffId: value.staffId,
    type: value.type,
    occurredAt: value.occurredAt,
    actorId: value.actorId,
    dataJson: JSON.stringify(value.data)
  };
}

function client(): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    "StaffCanonicalIT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
}

function isCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; code?: unknown };
  return value.statusCode === 409 &&
    (value.code === "EntityAlreadyExists" ||
      value.code === "ResourceAlreadyExists" ||
      value.code === "EntityAlreadyExistsError" ||
      value.code === undefined);
}

async function scenario(
  name: string,
  run: (table: TableClient) => Promise<void>
): Promise<void> {
  const table = client();
  await table.createTable();

  try {
    await run(table);
    console.log(`[PASS] ${name}`);
  } finally {
    await table.deleteTable();
  }
}

async function main(): Promise<void> {
  // Same identity and same payload: duplicate create is rejected.
  await scenario("same-key duplicate rejected", async table => {
    const row = entity(event("duplicate-event"));

    await table.createEntity(row);

    await assert.rejects(
      table.createEntity(row),
      isCollision
    );

    const stored = await table.getEntity<EventRow>(
      row.partitionKey,
      row.rowKey
    );

    assert.equal(stored.dataJson, row.dataJson);
  });

  // Same identity, different payload: no overwrite through create.
  await scenario("conflicting payload rejected", async table => {
    const original = entity(event("conflicting-event"));
    const conflicting = entity(event("conflicting-event", {
      data: { displayName: "Different Synthetic Staff" }
    }));

    await table.createEntity(original);

    await assert.rejects(
      table.createEntity(conflicting),
      isCollision
    );

    const stored = await table.getEntity<EventRow>(
      original.partitionKey,
      original.rowKey
    );

    assert.equal(stored.dataJson, original.dataJson);
    assert.notEqual(stored.dataJson, conflicting.dataJson);
  });

  // Competing creates of one storage identity have one winner.
  await scenario("concurrent same-key creates", async table => {
    const first = entity(event("concurrent-event", {
      data: { displayName: "Candidate A" }
    }));
    const second = entity(event("concurrent-event", {
      data: { displayName: "Candidate B" }
    }));

    const results = await Promise.allSettled([
      table.createEntity(first),
      table.createEntity(second)
    ]);

    const fulfilled = results.filter(
      result => result.status === "fulfilled"
    );

    const rejected = results.filter(
      result => result.status === "rejected"
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    for (const failure of rejected) {
      if (failure.status === "rejected") {
        assert.equal(isCollision(failure.reason), true);
      }
    }

    const stored = await table.getEntity<EventRow>(
      first.partitionKey,
      first.rowKey
    );

    assert.ok(
      stored.dataJson === first.dataJson ||
      stored.dataJson === second.dataJson
    );

    let count = 0;

    for await (const row of table.listEntities<EventRow>()) {
      if (row.rowKey === first.rowKey &&
          row.partitionKey === first.partitionKey) {
        count++;
      }
    }

    assert.equal(count, 1);
  });

  // The write may commit before the caller loses its acknowledgement.
  await scenario("lost acknowledgement remains ambiguous", async table => {
    const row = entity(event("lost-ack-event"));

    async function syntheticLostAcknowledgement(): Promise<void> {
      await table.createEntity(row);
      throw new Error("synthetic_lost_acknowledgement");
    }

    await assert.rejects(
      syntheticLostAcknowledgement(),
      /synthetic_lost_acknowledgement/
    );

    const stored = await table.getEntity<EventRow>(
      row.partitionKey,
      row.rowKey
    );

    assert.equal(stored.eventId, row.eventId);
    assert.equal(stored.dataJson, row.dataJson);

    // A failed caller observation did not mean the append failed.
    // This does not confer retry permission or prove writer identity.
  });

  // Event ID alone is not unique across row keys or partitions.
  await scenario("event-ID uniqueness gap", async table => {
    const identifier = "reused-synthetic-event-id";

    const first = entity(event(identifier));

    const later = entity(event(identifier, {
      occurredAt: "2026-10-15T12:00:01.000Z"
    }));

    const otherStaff = entity(event(identifier, {
      staffId: "synthetic-staff-b"
    }));

    await table.createEntity(first);
    await table.createEntity(later);
    await table.createEntity(otherStaff);

    const records: EventRow[] = [];

    for await (const row of table.listEntities<EventRow>()) {
      if (row.eventId === identifier) {
        records.push(row);
      }
    }

    assert.equal(records.length, 3);

    assert.equal(
      new Set(records.map(row =>
        `${row.partitionKey}|${row.rowKey}`
      )).size,
      3
    );

    // Three rows prove that the storage key does not enforce
    // global event-ID uniqueness. No such uniqueness is claimed.
  });

  console.log(
    "[PASS] Synthetic canonical append persistence proof completed"
  );
  console.log(
    "[SAFETY] No authorization, retry, recovery or migration permission"
  );
}

main().catch(() => {
  // Do not print exception bodies containing storage request details.
  console.error("[FAIL] Synthetic canonical append regression failed");
  process.exitCode = 1;
});
