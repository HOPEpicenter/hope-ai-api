import assert from "node:assert/strict";
import { test } from "node:test";
import {
  updateVisitorEvent,
  type VersionedVisitorEvent,
  type VisitorEventUpdateRepository
} from "../../src/services/visitors/updateVisitorEvent";

const command = {
  commandId: "123e4567-e89b-42d3-a456-426614174000",
  actorId: "synthetic-admin",
  eventId: "church-event-example",
  name: "Evening Worship"
};

function memoryRepository() {
  let state: VersionedVisitorEvent = {
    event: {
      id: "church-event-example",
      date: "2026-12-06",
      name: "Morning Worship",
      active: true
    },
    version: "version-1"
  };

  let writes = 0;
  const history = new Map<string, {
    eventId: string;
    fingerprint: string;
    active: boolean;
  }>();

  const repository: VisitorEventUpdateRepository = {
    readCommand: async id => history.get(id) ?? null,
    read: async id =>
      id === state.event.id
        ? {
            ...state,
            event: { ...state.event }
          }
        : null,

    updateIfVersion: async (
      event, version, commandId, fingerprint
    ) => {
      if (version !== state.version) return false;

      writes++;
      history.set(commandId, {
        eventId: event.id,
        fingerprint,
        active: event.active
      });

      state = {
        event: { ...event },
        version: `version-${writes + 1}`,
        lastCommandId: commandId,
        lastCommandFingerprint: fingerprint
      };

      return true;
    }
  };

  return {
    repository,
    state: () => state,
    writes: () => writes
  };
}

test("staff update preserves canonical event identity", async () => {
  const memory = memoryRepository();
  const result = await updateVisitorEvent(
    command, memory.repository
  );

  assert.equal(result.accepted, true);
  assert.equal(memory.state().event.id, command.eventId);
  assert.equal(memory.state().event.name, "Evening Worship");
  assert.equal(memory.writes(), 1);
});

test("event date can change without changing its ID", async () => {
  const memory = memoryRepository();

  const result = await updateVisitorEvent({
    ...command,
    name: undefined,
    date: "2026-12-13"
  }, memory.repository);

  assert.equal(result.accepted, true);
  assert.equal(memory.state().event.id, command.eventId);
  assert.equal(memory.state().event.date, "2026-12-13");
});

test("canceled events become inactive, never deleted", async () => {
  const memory = memoryRepository();

  const result = await updateVisitorEvent({
    ...command,
    name: undefined,
    active: false
  }, memory.repository);

  assert.equal(result.accepted, true);
  assert.equal(memory.state().event.active, false);
  assert.equal(memory.state().event.id, command.eventId);
});

test("the same command retry does not write twice", async () => {
  const memory = memoryRepository();

  const first = await updateVisitorEvent(
    command, memory.repository
  );
  const second = await updateVisitorEvent(
    command, memory.repository
  );

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);

  if (second.accepted) {
    assert.equal(second.replay, true);
  }

  assert.equal(memory.writes(), 1);
});

test("reused command with different details is rejected", async () => {
  const memory = memoryRepository();

  await updateVisitorEvent(command, memory.repository);

  const result = await updateVisitorEvent({
    ...command,
    name: "Different Event"
  }, memory.repository);

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_command_conflict"
  });

  assert.equal(memory.writes(), 1);
});

test("inactive events cannot be silently reactivated", async () => {
  const memory = memoryRepository();

  await updateVisitorEvent({
    ...command,
    name: undefined,
    active: false
  }, memory.repository);

  const result = await updateVisitorEvent({
    ...command,
    commandId: "123e4567-e89b-42d3-a456-426614174001",
    name: undefined,
    active: true
  }, memory.repository);

  assert.equal(result.accepted, false);
  assert.equal(memory.state().event.active, false);
});

test("concurrent version conflicts never overwrite changes", async () => {
  const memory = memoryRepository();

  const competing: VisitorEventUpdateRepository = {
    readCommand: memory.repository.readCommand,
    read: memory.repository.read,
    updateIfVersion: async () => false
  };

  const result = await updateVisitorEvent(
    command, competing
  );

  assert.deepEqual(result, {
    accepted: false,
    status: 409,
    error: "event_changed_retry_with_new_command"
  });

  assert.equal(memory.writes(), 0);
});

test("invalid requests never reach storage", async () => {
  const repository: VisitorEventUpdateRepository = {
    readCommand: async () => {
      throw new Error("Unexpected history read");
    },
    read: async () => {
      throw new Error("Unexpected storage read");
    },
    updateIfVersion: async () => {
      throw new Error("Unexpected storage write");
    }
  };

  const invalid = [
    { ...command, commandId: "invalid" },
    { ...command, actorId: "" },
    { ...command, eventId: "" },
    { ...command, name: "" },
    { ...command, name: "x".repeat(121) },
    { ...command, name: undefined, date: "2026-02-30" },
    { ...command, name: undefined, active: "yes" as any },
    {
      ...command,
      name: undefined,
      date: undefined,
      active: undefined
    }
  ];

  for (const input of invalid) {
    const result = await updateVisitorEvent(
      input, repository
    );

    assert.equal(result.accepted, false);
    if (!result.accepted) {
      assert.equal(result.status, 400);
    }
  }
});