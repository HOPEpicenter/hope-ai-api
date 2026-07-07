$ErrorActionPreference = "Stop"

Write-Host "=== ASSERT: Pastoral notes projection ==="

$script = @"
const {
  projectPastoralNotes
} = require("./dist/domain/engagement/projectPastoralNotes");

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

const visitorId = "11111111-1111-1111-1111-111111111111";
const noteId = "note-11111111111111111111111111111111";

const notes = projectPastoralNotes(visitorId, [
  {
    v: 1,
    eventId: "evt-00000000000000000000000000000001",
    visitorId,
    type: "note.add",
    occurredAt: "2026-07-07T12:00:00.000Z",
    source: { system: "assert", actorId: "ops-user-1" },
    data: {
      noteId,
      text: "Original pastoral note",
      visibility: "team"
    }
  },
  {
    v: 1,
    eventId: "evt-00000000000000000000000000000002",
    visitorId,
    type: "note.updated",
    occurredAt: "2026-07-07T12:05:00.000Z",
    source: { system: "assert", actorId: "ops-user-2" },
    data: {
      noteId,
      text: "Corrected pastoral note",
      visibility: "private",
      version: 2,
      reason: "Corrected detail"
    }
  }
]);

assert(notes.length === 1, "one note should be projected");
assert(notes[0].noteId === noteId, "noteId should match");
assert(notes[0].text === "Corrected pastoral note", "latest text should win");
assert(notes[0].visibility === "private", "latest visibility should win");
assert(notes[0].version === 2, "version should advance");
assert(notes[0].edited === true, "edited should be true after update");
assert(notes[0].createdBy === "ops-user-1", "createdBy should come from note.add");
assert(notes[0].lastEditedBy === "ops-user-2", "lastEditedBy should come from note.updated");
assert(notes[0].history.length === 2, "history should preserve add and update");

console.log("OK: pastoral notes projection assertion passed.");
"@

$script | node