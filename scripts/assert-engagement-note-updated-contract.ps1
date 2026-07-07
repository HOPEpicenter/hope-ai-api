$ErrorActionPreference = "Stop"

Write-Host "=== ASSERT: Engagement note.updated contract ==="

$script = @"
const {
  validateEngagementEventEnvelopeV1Strict
} = require("./dist/contracts/engagementEvent.v1");

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

const valid = validateEngagementEventEnvelopeV1Strict({
  v: 1,
  eventId: "evt-11111111111111111111111111111111",
  visitorId: "11111111-1111-1111-1111-111111111111",
  type: "note.updated",
  occurredAt: "2026-07-07T12:00:00.000Z",
  source: {
    system: "assert-engagement-note-updated-contract",
    actorId: "ops-user-1"
  },
  data: {
    noteId: "note-11111111111111111111111111111111",
    text: "Corrected pastoral note",
    version: 2,
    visibility: "team",
    reason: "Corrected spelling"
  }
});

assert(valid.ok, "valid note.updated should pass strict validation");
assert(valid.value.data.text === "Corrected pastoral note", "text should be preserved");
assert(valid.value.data.noteId === "note-11111111111111111111111111111111", "noteId should be preserved");
assert(valid.value.data.version === 2, "version should be preserved");
assert(valid.value.data.visibility === "team", "visibility should be normalized");

const invalid = validateEngagementEventEnvelopeV1Strict({
  v: 1,
  eventId: "evt-22222222222222222222222222222222",
  visitorId: "11111111-1111-1111-1111-111111111111",
  type: "note.updated",
  occurredAt: "2026-07-07T12:00:00.000Z",
  source: {
    system: "assert-engagement-note-updated-contract"
  },
  data: {
    noteId: "note-22222222222222222222222222222222",
    text: "Invalid version",
    version: 1
  }
});

assert(!invalid.ok, "note.updated version below 2 should fail validation");

console.log("OK: note.updated contract assertion passed.");
"@

$script | node