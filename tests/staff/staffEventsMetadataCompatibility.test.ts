import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  StaffEventsRepository,
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";

const fixture: StaffEvent = {
  eventId: "evt-canonical-a",
  staffId: "synthetic-staff-a",
  type: "staff.created",
  occurredAt: "2026-11-09T12:00:00.000Z",
  actorId: "synthetic-admin",
  data: {
    displayName: "Synthetic Staff",
    status: "active"
  }
};

function eventRow(event: StaffEvent) {
  return {
    partitionKey: event.staffId,
    rowKey: `${event.occurredAt}__${event.eventId}`,
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    dataJson: JSON.stringify(event.data)
  };
}

function fakeTable(rows: object[]) {
  const writes: unknown[] = [];

  const table = {
    async createEntity(entity: unknown) {
      writes.push(entity);
    },
    async *listEntities() {
      for (const row of rows) {
        yield row;
      }
    }
  } as unknown as TableClient;

  return { table, writes };
}

async function main(): Promise<void> {
  const head = {
    partitionKey: fixture.staffId,
    rowKey: STAFF_SECURITY_METADATA_HEAD,
    revision: 4,
    state: "active"
  };

  const receipt = {
    partitionKey: fixture.staffId,
    rowKey: STAFF_SECURITY_METADATA_RECEIPT_PREFIX + "op-123",
    operationId: "op-123",
    revision: 4
  };

  // The canonical reader preserves Staff events while excluding
  // only its explicitly reserved metadata namespace.
  const mixed = fakeTable([
    head,
    eventRow(fixture),
    receipt
  ]);

  const repository = new StaffEventsRepository(mixed.table);

  assert.deepEqual(await repository.listAll(), [fixture]);
  console.log("[PASS] Metadata excluded; canonical event preserved");

  // The existing canonical append must keep its original
  // partition and row-key convention.
  await repository.append(fixture);

  assert.equal(mixed.writes.length, 1);
  assert.deepEqual(mixed.writes[0], eventRow(fixture));

  console.log("[PASS] Canonical append storage identity preserved");

  // Unrecognized rows are not ignored as if they were trusted
  // metadata. A malformed row fails the read.
  const unknown = fakeTable([
    {
      partitionKey: fixture.staffId,
      rowKey: "__unknown_security_row__",
      revision: 1
    }
  ]);

  await assert.rejects(
    new StaffEventsRepository(unknown.table).listAll(),
    /Malformed canonical Staff event row/
  );

  console.log("[PASS] Unknown metadata fails closed");

  // A malformed canonical-shaped event also fails closed.
  const invalid = fakeTable([
    {
      ...eventRow(fixture),
      dataJson: "[]"
    }
  ]);

  await assert.rejects(
    new StaffEventsRepository(invalid.table).listAll(),
    /Malformed canonical Staff event data/
  );

  console.log("[PASS] Invalid Staff event payload rejected");

  const ordinary = fakeTable([eventRow(fixture)]);

  assert.deepEqual(
    await new StaffEventsRepository(ordinary.table).listAll(),
    [fixture]
  );

  console.log("[PASS] Existing event-only tables remain compatible");
}

main().catch(() => {
  console.error("[FAIL] StaffEvents metadata compatibility regression");
  process.exitCode = 1;
});