import assert from "node:assert/strict";
import {
  compareTimelineNewestFirst,
  makeTimelineCursor,
  parseTimelineCursor,
  makeNewestFirstRowKey
} from "../../src/shared/timeline/timelineOrdering";

const newer = {
  occurredAt: "2026-01-02T00:00:00Z",
  eventId: "evt-b"
};

const older = {
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-a"
};

assert.equal(
  compareTimelineNewestFirst(newer, older) < 0,
  true,
  "newer events should sort before older events"
);

assert.equal(
  compareTimelineNewestFirst(older, newer) > 0,
  true,
  "older events should sort after newer events"
);

const sameTimeA = {
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-a"
};

const sameTimeB = {
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-b"
};

assert.equal(
  compareTimelineNewestFirst(sameTimeB, sameTimeA) < 0,
  true,
  "eventId must deterministically break timestamp ties"
);

const cursor = makeTimelineCursor({
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-c",
  stream: "engagement"
});

assert.ok(cursor, "cursor should be created");

const parsed = parseTimelineCursor(cursor!);

assert.deepEqual(parsed, {
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-c",
  stream: "engagement"
});

const rowKey1 = makeNewestFirstRowKey(
  "2026-01-01T00:00:00Z",
  "evt-1"
);

const rowKey2 = makeNewestFirstRowKey(
  "2026-01-02T00:00:00Z",
  "evt-2"
);

assert.equal(
  rowKey2 < rowKey1,
  true,
  "newer row keys must sort ahead of older row keys"
);

console.log("timelineOrdering.test.ts passed");
