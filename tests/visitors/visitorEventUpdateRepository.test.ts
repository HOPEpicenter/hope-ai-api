import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  TableClient,
  TransactionAction
} from "@azure/data-tables";
import {
  createVisitorEventUpdateRepository
} from "../../src/services/visitors/visitorEventUpdateRepository";
import {
  updateVisitorEvent
} from "../../src/services/visitors/updateVisitorEvent";

const command = {
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  actorId: "synthetic-admin",
  eventId: "church-event-example",
  name: "Evening Worship"
};

function storage() {
  const rows = new Map<string, any>();
  const transactions: TransactionAction[][] = [];

  rows.set("church-event-example", {
    partitionKey: "directory",
    rowKey: "church-event-example",
    date: "2026-12-06",
    name: "Morning Worship",
    active: true,
    commandId: "original-creation",
    actorId: "synthetic-admin",
    etag: "v1"
  });

  let versionNumber = 1;

  const table = {
    async getEntity(_partition: string, id: string) {
      const row = rows.get(id);
      if (!row) throw { statusCode: 404 };
      return { ...row };
    },

    async submitTransaction(actions: TransactionAction[]) {
      transactions.push(actions);

      assert.equal(actions.length, 2);
      assert.equal(actions[0][0], "update");
      assert.equal(actions[1][0], "create");

      const updated = actions[0][1] as any;
      const ledger = actions[1][1] as any;
      const options = actions[0][3] as { etag: string };

      const existing = rows.get(updated.rowKey);

      if (!existing || options.etag !== existing.etag) {
        throw { statusCode: 412 };
      }

      if (rows.has(ledger.rowKey)) {
        throw { statusCode: 409 };
      }

      versionNumber++;

      rows.set(updated.rowKey, {
        ...existing,
        ...updated,
        etag: `v${versionNumber}`
      });
      rows.set(ledger.rowKey, { ...ledger });
    }
  };

  return {
    rows,
    transactions,
    repository: createVisitorEventUpdateRepository(
      table as unknown as TableClient
    )
  };
}

test("a durable event update preserves identity and records command", async () => {
  const state = storage();

  const result = await updateVisitorEvent(
    command, state.repository
  );

  assert.equal(result.accepted, true);
  assert.equal(state.rows.get(command.eventId).name, "Evening Worship");
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].length, 2);
  assert.equal(state.rows.size, 2);
});

test("the same command retry does not produce another transaction", async () => {
  const state = storage();

  const first = await updateVisitorEvent(
    command, state.repository
  );
  const second = await updateVisitorEvent(
    command, state.repository
  );

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  if (second.accepted) {
    assert.equal(second.replay, true);
  }

  assert.equal(state.transactions.length, 1);
});

test("event date changes without changing its canonical ID", async () => {
  const state = storage();

  const result = await updateVisitorEvent({
    ...command,
    name: undefined,
    date: "2026-12-13"
  }, state.repository);

  assert.equal(result.accepted, true);
  assert.equal(state.rows.get(command.eventId).date, "2026-12-13");
  assert.equal(state.rows.get(command.eventId).rowKey, command.eventId);
});

test("deactivation retains the event row and durable command", async () => {
  const state = storage();

  const result = await updateVisitorEvent({
    ...command,
    name: undefined,
    active: false
  }, state.repository);

  assert.equal(result.accepted, true);
  assert.equal(state.rows.get(command.eventId).active, false);
  assert.equal(state.rows.size, 2);
});

test("outdated ETags reject competing updates", async () => {
  const state = storage();

  const snapshot = await state.repository.read(command.eventId);
  assert.ok(snapshot);

  const first = await updateVisitorEvent(
    command, state.repository
  );
  assert.equal(first.accepted, true);

  const stale = await state.repository.updateIfVersion(
    {
      id: command.eventId,
      date: "2026-12-20",
      name: "Changed",
      active: true
    },
    snapshot.version,
    "123e4567-e89b-42d3-a456-426614174001",
    "synthetic-fingerprint"
  );

  assert.equal(stale, false);
  assert.equal(state.rows.get(command.eventId).date, "2026-12-06");
});

test("a missing event is not silently created by an update", async () => {
  const state = storage();

  const result = await updateVisitorEvent({
    ...command,
    eventId: "missing-event"
  }, state.repository);

  assert.deepEqual(result, {
    accepted: false,
    status: 404,
    error: "event_not_found"
  });

  assert.equal(state.transactions.length, 0);
});

test("malformed persisted rows fail closed", async () => {
  const state = storage();

  const row = state.rows.get(command.eventId);
  state.rows.set(command.eventId, {
    ...row,
    date: "2026-02-30"
  });

  await assert.rejects(
    state.repository.read(command.eventId),
    /Malformed canonical event snapshot/
  );
});

test("storage failures propagate without reporting success", async () => {
  const table = {
    async getEntity(_partition: string, rowKey: string) {
      // No prior command exists in this simulated storage.
      // The repository must then reach the event update,
      // where the synthetic transaction failure is raised.
      if (rowKey.startsWith("visitor-event-command-")) {
        throw { statusCode: 404, code: "ResourceNotFound" };
      }
      return {
        partitionKey: "directory",
        rowKey: command.eventId,
        date: "2026-12-06",
        name: "Morning Worship",
        active: true,
        etag: "v1"
      };
    },
    async submitTransaction() {
      throw new Error("Synthetic storage unavailable");
    }
  };

  const repository = createVisitorEventUpdateRepository(
    table as unknown as TableClient
  );

  await assert.rejects(
    updateVisitorEvent(command, repository),
    /Synthetic storage unavailable/
  );
});
test("an older command remains replay-safe after a newer update", async () => {
  const state = storage();

  const first = await updateVisitorEvent(command, state.repository);
  assert.equal(first.accepted, true);

  const newer = await updateVisitorEvent({
    ...command,
    commandId: "123e4567-e89b-42d3-a456-426614174001",
    name: "Late Worship"
  }, state.repository);

  assert.equal(newer.accepted, true);
  assert.equal(state.rows.get(command.eventId).name, "Late Worship");

  const previousTransactions = state.transactions.length;
  const replay = await updateVisitorEvent(command, state.repository);

  assert.deepEqual(replay, {
    accepted: true,
    eventId: command.eventId,
    replay: true,
    active: true
  });

  assert.equal(state.transactions.length, previousTransactions);
  assert.equal(state.rows.get(command.eventId).name, "Late Worship");
});

test("historical command reuse with changed intent is denied", async () => {
  const state = storage();
  await updateVisitorEvent(command, state.repository);

  const result = await updateVisitorEvent({
    ...command,
    name: "Forged Replacement"
  }, state.repository);

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  });

  assert.equal(state.transactions.length, 1);
});

test("malformed historical command records fail closed", async () => {
  const state = storage();
  await updateVisitorEvent(command, state.repository);

  const key = `visitor-event-command-${command.commandId}`;
  const record = state.rows.get(key);
  assert.ok(record);

  state.rows.set(key, { ...record, active: "yes" });

  await assert.rejects(
    updateVisitorEvent(command, state.repository),
    /Malformed visitor event command history/
  );
});

test("a missing command-ledger entry cannot be treated as a replay", async () => {
  const state = storage();
  await updateVisitorEvent(command, state.repository);

  state.rows.delete(`visitor-event-command-${command.commandId}`);

  const result = await updateVisitorEvent(command, state.repository);

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_command_history_missing"
  });
});