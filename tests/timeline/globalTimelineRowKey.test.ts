import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildRowKey,
  toTicksDescending
} from "../../src/shared/timeline/globalTimelineRowKey";

// Expected values were derived from the original GlobalTimelineRepository implementation.
const pinned: [string, string, string][] = [
  ["2030-01-01T00:00:00.000Z", "synthetic-event-001", "8106543999999|synthetic-event-001"],
  // millisecond precision
  ["2030-01-01T00:00:00.123Z", "synthetic-event-001", "8106543999876|synthetic-event-001"],
  // epoch
  ["1970-01-01T00:00:00.000Z", "e", "9999999999999|e"],
  // clamping at and beyond the 9999999999999 ms boundary
  ["2286-11-20T17:46:39.999Z", "e", "0000000000000|e"],
  ["2286-11-20T17:46:40.000Z", "e", "0000000000000|e"],
  ["+275760-09-13T00:00:00.000Z", "e", "0000000000000|e"],
  // invalid timestamps fall back to 0 ms (not the current time)
  ["not-a-date", "e", "9999999999999|e"],
  ["", "e", "9999999999999|e"],
  // event ids are appended verbatim
  ["2030-01-01T00:00:00.000Z", "a|b/c:d#e ?", "8106543999999|a|b/c:d#e ?"]
];

for (const [occurredAt, eventId, expected] of pinned) {
  assert.equal(buildRowKey({ occurredAt, eventId }), expected, `${occurredAt} ${eventId}`);
}

// One millisecond before the boundary is not clamped.
assert.equal(toTicksDescending("2286-11-20T17:46:39.998Z"), "0000000000001");
assert.equal(toTicksDescending("2030-01-01T00:00:00.000Z").length, 13);

// Equal timestamps differ only by event id; newer timestamps sort first.
const a = buildRowKey({ occurredAt: "2030-01-01T00:00:00.000Z", eventId: "a" });
const b = buildRowKey({ occurredAt: "2030-01-01T00:00:00.000Z", eventId: "b" });
assert.equal(a.split("|")[0], b.split("|")[0]);
assert.ok(a < b);
const newer = buildRowKey({ occurredAt: "2030-01-01T00:00:01.000Z", eventId: "a" });
assert.ok(newer < a);

// Deterministic.
assert.equal(
  buildRowKey({ occurredAt: "2030-01-01T00:00:00.000Z", eventId: "x" }),
  buildRowKey({ occurredAt: "2030-01-01T00:00:00.000Z", eventId: "x" })
);

// Source guards: repository uses the shared helper and keeps no independent copy;
// the helper has no imports.
const repo = fs.readFileSync(
  path.resolve(process.cwd(), "src/repositories/globalTimelineRepository.ts"),
  "utf8"
);
assert.ok(
  repo.includes('import { buildRowKey } from "../shared/timeline/globalTimelineRowKey";')
);
assert.ok(!/function\s+buildRowKey/.test(repo));
assert.ok(!/function\s+toTicksDescending/.test(repo));
assert.ok(repo.includes("rowKey: buildRowKey(item)"));

const helper = fs.readFileSync(
  path.resolve(process.cwd(), "src/shared/timeline/globalTimelineRowKey.ts"),
  "utf8"
);
assert.ok(!/^\s*import\s/m.test(helper));
assert.ok(!helper.includes("process.env"));

console.log("Global Timeline row-key parity assertions passed.");
