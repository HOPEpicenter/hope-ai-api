import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVisitorEvent,
  type StoredVisitorEvent,
  type VisitorEventWriter
} from "../../src/services/visitors/createVisitorEvent";

const command = {
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  actorId: "synthetic-admin",
  date: "2026-12-06",
  name: "Sunday Worship"
};

function memoryWriter(): {
  writer: VisitorEventWriter;
  records: Map<string, StoredVisitorEvent>;
} {
  const records = new Map<string, StoredVisitorEvent>();

  const writer: VisitorEventWriter = {
    create: async record => {
      const key = `${record.date}/${record.id}`;
      if (records.has(key)) return "exists";
      records.set(key, { ...record });
      return "created";
    },
    read: async (date, id) =>
      records.get(`${date}/${id}`) ?? null
  };

  return { writer, records };
}

test("an approved command creates one stable event", async () => {
  const { writer, records } = memoryWriter();
  const result = await createVisitorEvent(command, writer);

  assert.equal(result.accepted, true);
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].active, true);
});

test("retry of the same command returns the same event ID", async () => {
  const { writer, records } = memoryWriter();

  const first = await createVisitorEvent(command, writer);
  const second = await createVisitorEvent(command, writer);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  if (first.accepted && second.accepted) {
    assert.equal(first.eventId, second.eventId);
    assert.equal(first.replay, false);
    assert.equal(second.replay, true);
  }

  assert.equal(records.size, 1);
});

test("reusing a command with different data is rejected", async () => {
  const { writer, records } = memoryWriter();

  await createVisitorEvent(command, writer);

  const result = await createVisitorEvent(
    { ...command, name: "Different Event" },
    writer
  );

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  });

  assert.equal(records.size, 1);
});

test("invalid dates, names, actors and IDs never reach storage", async () => {
  const writer: VisitorEventWriter = {
    create: async () => {
      throw new Error("Unexpected write");
    },
    read: async () => {
      throw new Error("Unexpected read");
    }
  };

  const invalid = [
    { ...command, date: "2026-02-30" },
    { ...command, name: "" },
    { ...command, name: "x".repeat(121) },
    { ...command, actorId: "" },
    { ...command, commandId: "not-a-uuid" }
  ];

  for (const input of invalid) {
    const result = await createVisitorEvent(input, writer);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 400);
  }
});

test("missing conflicting record cannot be treated as success", async () => {
  const writer: VisitorEventWriter = {
    create: async () => "exists",
    read: async () => null
  };

  const result = await createVisitorEvent(command, writer);

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  });
});

test("storage errors propagate instead of returning success", async () => {
  const writer: VisitorEventWriter = {
    create: async () => {
      throw new Error("Synthetic storage failure");
    },
    read: async () => null
  };

  await assert.rejects(
    createVisitorEvent(command, writer),
    /Synthetic storage failure/
  );
});