import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableClient } from "@azure/data-tables";
import { createVisitorEvent } from "../../src/services/visitors/createVisitorEvent";
import { createVisitorEventTableWriter } from "../../src/services/visitors/visitorEventTableWriter";

const input = {
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  actorId: "synthetic-admin",
  date: "2026-12-06",
  name: "Sunday Worship"
};

type Row = {
  partitionKey: string;
  rowKey: string;
  date: string;
  name: string;
  active: boolean;
  commandId: string;
  actorId: string;
};

function storage() {
  const rows = new Map<string, Row>();

  const table = {
    async createEntity(row: Row) {
      const key = `${row.partitionKey}/${row.rowKey}`;

      if (rows.has(key)) {
        throw { statusCode: 409, code: "EntityAlreadyExists" };
      }

      rows.set(key, { ...row });
      return {};
    },

    async getEntity(partitionKey: string, rowKey: string) {
      const row = rows.get(`${partitionKey}/${rowKey}`);

      if (!row) {
        throw { statusCode: 404, code: "ResourceNotFound" };
      }

      return { ...row };
    }
  };

  return {
    rows,
    writer: createVisitorEventTableWriter(
      table as unknown as TableClient
    )
  };
}

test("event command persists in the reader-compatible schema", async () => {
  const { rows, writer } = storage();
  const result = await createVisitorEvent(input, writer);

  assert.equal(result.accepted, true);
  assert.equal(rows.size, 1);

  const row = [...rows.values()][0];

  assert.equal(row.partitionKey, "directory");
  assert.equal(row.date, "2026-12-06");
  assert.equal(row.name, "Sunday Worship");
  assert.equal(row.active, true);
  assert.equal(row.actorId, "synthetic-admin");
  assert.ok(row.rowKey.startsWith("church-event-"));
});

test("duplicate retry returns the original event ID", async () => {
  const { writer, rows } = storage();

  const first = await createVisitorEvent(input, writer);
  const second = await createVisitorEvent(input, writer);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  if (first.accepted && second.accepted) {
    assert.equal(first.eventId, second.eventId);
    assert.equal(second.replay, true);
  }

  assert.equal(rows.size, 1);
});

test("same command ID with changed details is a conflict", async () => {
  const { writer, rows } = storage();

  await createVisitorEvent(input, writer);

  const result = await createVisitorEvent(
    { ...input, name: "Changed Worship" },
    writer
  );

  assert.equal(result.accepted, false);
  if (!result.accepted) {
    assert.equal(result.status, 409);
  }

  assert.equal(rows.size, 1);
});

test("unexpected storage failures propagate without success", async () => {
  const table = {
    async createEntity() {
      throw new Error("Synthetic storage offline");
    },
    async getEntity() {
      throw new Error("Unexpected read");
    }
  };

  const writer = createVisitorEventTableWriter(
    table as unknown as TableClient
  );

  await assert.rejects(
    createVisitorEvent(input, writer),
    /Synthetic storage offline/
  );
});

test("missing and malformed rows never become valid replays", async () => {
  const { writer, rows } = storage();

  const missing = await writer.read(
    "2026-12-06",
    "church-event-missing"
  );
  assert.equal(missing, null);

  const result = await createVisitorEvent(input, writer);
  assert.equal(result.accepted, true);

  const key = [...rows.keys()][0];
  const row = rows.get(key)!;

  rows.set(key, { ...row, actorId: "" });

  await assert.rejects(
    writer.read(input.date, row.rowKey),
    /Malformed canonical visitor event row/
  );
});
test("a command ID cannot create another event on a different date", async () => {
  const { writer, rows } = storage();

  const first = await createVisitorEvent(input, writer);
  assert.equal(first.accepted, true);

  const changedDate = await createVisitorEvent(
    { ...input, date: "2026-12-13" },
    writer
  );

  assert.deepEqual(changedDate, {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  });

  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].date, "2026-12-06");
});

test("two separate commands may create events on different dates", async () => {
  const { writer, rows } = storage();

  const first = await createVisitorEvent(input, writer);
  const second = await createVisitorEvent({
    ...input,
    commandId: "123e4567-e89b-42d3-a456-426614174001",
    date: "2026-12-13"
  }, writer);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(rows.size, 2);
});