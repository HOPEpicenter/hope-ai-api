import assert from "node:assert/strict";
import { paginateTimelineItems } from "../../src/shared/timeline/timelinePaginator";

const items = [
  {
    occurredAt: "2026-01-03T00:00:00Z",
    eventId: "evt-3"
  },
  {
    occurredAt: "2026-01-02T00:00:00Z",
    eventId: "evt-2"
  },
  {
    occurredAt: "2026-01-01T00:00:00Z",
    eventId: "evt-1"
  }
];

const firstPage = paginateTimelineItems(items, 2);

assert.equal(firstPage.items.length, 2);
assert.ok(firstPage.nextCursor);

assert.equal(firstPage.items[0].eventId, "evt-3");
assert.equal(firstPage.items[1].eventId, "evt-2");

const secondPage = paginateTimelineItems(
  items,
  2,
  firstPage.nextCursor!
);

assert.equal(secondPage.items.length, 1);
assert.equal(secondPage.items[0].eventId, "evt-1");
assert.equal(secondPage.nextCursor, null);

console.log("timelinePaginator.test.ts passed");
