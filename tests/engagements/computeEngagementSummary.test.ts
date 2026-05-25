import assert from "node:assert/strict";
import {
  computeNextEngagementSummary
} from "../../src/domain/engagement/computeEngagementSummary";

const nowIso = "2026-01-05T00:00:00Z";

const first = computeNextEngagementSummary({
  prev: null,
  event: {
    visitorId: "visitor-1",
    rowKey: "2026-01-01T00:00:00Z__evt-1",
    type: "CHECKIN",
    channel: "mobile",
    occurredAt: "2026-01-01T00:00:00Z"
  },
  nowIso
});

assert.equal(first.eventCount, 1);
assert.equal(first.lastEventRowKey, "2026-01-01T00:00:00Z__evt-1");

const second = computeNextEngagementSummary({
  prev: first,
  event: {
    visitorId: "visitor-1",
    rowKey: "2026-01-02T00:00:00Z__evt-2",
    type: "PRAYER",
    channel: "kiosk",
    occurredAt: "2026-01-02T00:00:00Z"
  },
  nowIso
});

assert.equal(second.eventCount, 2);
assert.equal(second.lastEngagedAt, "2026-01-02T00:00:00Z");

assert.equal(second.channels.mobile, 1);
assert.equal(second.channels.kiosk, 1);

assert.equal(second.types.CHECKIN, 1);
assert.equal(second.types.PRAYER, 1);

console.log("computeEngagementSummary.test.ts passed");
