import assert from "node:assert/strict";
import {
  compareTimelineNewestFirst
} from "../../src/shared/timeline/timelineOrdering";

const items = [
  {
    stream: "formation",
    occurredAt: "2026-01-02T00:00:00Z",
    eventId: "evt-b"
  },
  {
    stream: "engagement",
    occurredAt: "2026-01-02T00:00:00Z",
    eventId: "evt-a"
  }
];

items.sort(compareTimelineNewestFirst);

assert.equal(items[0].eventId, "evt-b");
assert.equal(items[1].eventId, "evt-a");

console.log("integrationMergePrecedence.test.ts passed");
