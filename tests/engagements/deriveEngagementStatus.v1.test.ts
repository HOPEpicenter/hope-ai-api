import assert from "node:assert/strict";
import {
  deriveEngagementStatusFromEvents
} from "../../src/domain/engagement/deriveEngagementStatus.v1";

const visitorId = "11111111-1111-1111-1111-111111111111";

const events = [
  {
    v: 1 as const,
    eventId: "evt-3",
    visitorId,
    type: "status.transition",
    occurredAt: "2026-01-03T00:00:00Z",
    source: { system: "test" },
    data: {
      from: "ENGAGED",
      to: "DISENGAGED"
    }
  },
  {
    v: 1 as const,
    eventId: "evt-1",
    visitorId,
    type: "status.transition",
    occurredAt: "2026-01-01T00:00:00Z",
    source: { system: "test" },
    data: {
      from: "UNKNOWN",
      to: "ENGAGED"
    }
  },
  {
    v: 1 as const,
    eventId: "evt-2",
    visitorId,
    type: "status.transition",
    occurredAt: "2026-01-02T00:00:00Z",
    source: { system: "test" },
    data: {
      from: "ENGAGED",
      to: "ENGAGED"
    }
  }
];

const result = deriveEngagementStatusFromEvents(
  visitorId,
  events as any
);

assert.equal(result.status, "DISENGAGED");
assert.equal(result.lastEventId, "evt-3");

const duplicateReplay = deriveEngagementStatusFromEvents(
  visitorId,
  [...events, events[2]] as any
);

assert.equal(
  duplicateReplay.status,
  "DISENGAGED",
  "duplicate replay should not change canonical state"
);

assert.equal(
  duplicateReplay.lastEventId,
  "evt-3",
  "duplicate replay should not advance last event"
);

console.log("deriveEngagementStatus.v1.test.ts passed");
