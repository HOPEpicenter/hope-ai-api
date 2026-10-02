import assert from "node:assert/strict";
import {
  projectMinistryAreas,
  normalizeLeaderStaffIds,
  type MinistryAreaEvent
} from "../../src/domain/ministryAreas/projectMinistryAreas";

function createdEvent(
  overrides: Partial<MinistryAreaEvent["data"]> = {}
): MinistryAreaEvent {
  return {
    eventId: "evt-created",
    ministryAreaId: "ministry-area-one",
    type: "ministryArea.created",
    occurredAt: "2026-09-01T00:00:00.000Z",
    actorId: "admin-1",
    sequence: 1,
    data: { displayName: "Pastoral Care", status: "active", ...overrides }
  };
}

function updatedEvent(
  overrides: Partial<MinistryAreaEvent["data"]> = {},
  sequence = 2
): MinistryAreaEvent {
  return {
    eventId: `evt-updated-${sequence}`,
    ministryAreaId: "ministry-area-one",
    type: "ministryArea.updated",
    occurredAt: "2026-09-02T00:00:00.000Z",
    actorId: "admin-1",
    sequence,
    data: overrides
  };
}

function run(): void {
  // (A) A legacy created event with leaderStaffId projects leaderStaffIds = [leader].
  const legacyCreated = projectMinistryAreas([
    createdEvent({ leaderStaffId: "staff-1" })
  ]);
  assert.deepEqual(legacyCreated[0].leaderStaffIds, ["staff-1"]);
  assert.equal(legacyCreated[0].leaderStaffId, "staff-1");

  // (B) leaderStaffId null projects leaderStaffIds = [] and leaderStaffId = null.
  const legacyCreatedNull = projectMinistryAreas([
    createdEvent({ leaderStaffId: null })
  ]);
  assert.deepEqual(legacyCreatedNull[0].leaderStaffIds, []);
  assert.equal(legacyCreatedNull[0].leaderStaffId, null);

  // A created event with no leader fields at all also yields an empty leader set.
  const noLeaderCreated = projectMinistryAreas([createdEvent()]);
  assert.deepEqual(noLeaderCreated[0].leaderStaffIds, []);
  assert.equal(noLeaderCreated[0].leaderStaffId, null);

  // (C) A new created event with leaderStaffIds projects both leaders, in order.
  const multiCreated = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a", "staff-b"] })
  ]);
  assert.deepEqual(multiCreated[0].leaderStaffIds, ["staff-a", "staff-b"]);
  assert.equal(multiCreated[0].leaderStaffId, "staff-a");

  // (D) Duplicate leader IDs normalize/deduplicate, preserving first occurrence.
  const dedupeCreated = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a", "staff-b", "staff-a"] })
  ]);
  assert.deepEqual(dedupeCreated[0].leaderStaffIds, ["staff-a", "staff-b"]);

  // (E) Whitespace normalizes.
  const whitespaceCreated = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["  staff-a  ", " staff-b"] })
  ]);
  assert.deepEqual(whitespaceCreated[0].leaderStaffIds, ["staff-a", "staff-b"]);

  assert.deepEqual(
    normalizeLeaderStaffIds(["  staff-a  ", "staff-b", "staff-a", "", "   "]),
    ["staff-a", "staff-b"]
  );
  assert.deepEqual(normalizeLeaderStaffIds(undefined), []);

  // ministryArea.updated: explicit leaderStaffIds replaces the complete leader set.
  const updatedWithIds = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a"] }),
    updatedEvent({ leaderStaffIds: ["staff-b", "staff-c"] })
  ]);
  assert.deepEqual(updatedWithIds[0].leaderStaffIds, ["staff-b", "staff-c"]);
  assert.equal(updatedWithIds[0].leaderStaffId, "staff-b");

  // ministryArea.updated: legacy leaderStaffId (non-blank) replaces the leader set with a singleton.
  const updatedWithLegacySingle = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a", "staff-b"] }),
    updatedEvent({ leaderStaffId: "staff-c" })
  ]);
  assert.deepEqual(updatedWithLegacySingle[0].leaderStaffIds, ["staff-c"]);

  // ministryArea.updated: legacy leaderStaffId = null clears the leader set.
  const updatedWithLegacyNull = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a", "staff-b"] }),
    updatedEvent({ leaderStaffId: null })
  ]);
  assert.deepEqual(updatedWithLegacyNull[0].leaderStaffIds, []);
  assert.equal(updatedWithLegacyNull[0].leaderStaffId, null);

  // ministryArea.updated: neither leader field present preserves the existing leader set.
  const updatedPreserved = projectMinistryAreas([
    createdEvent({ leaderStaffIds: ["staff-a", "staff-b"] }),
    updatedEvent({ displayName: "Pastoral Care Team" })
  ]);
  assert.deepEqual(updatedPreserved[0].leaderStaffIds, ["staff-a", "staff-b"]);
  assert.equal(updatedPreserved[0].displayName, "Pastoral Care Team");

  console.log("projectMinistryAreas.test.ts passed");
}

run();
