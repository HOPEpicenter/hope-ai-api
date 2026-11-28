import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveVisitorEventContext
} from "../../src/services/visitors/resolveVisitorEventContext";

const events = [
  {
    id: "worship-2026-11-29",
    date: "2026-11-29",
    name: "Worship",
    active: true
  },
  {
    id: "prayer-2026-11-29",
    date: "2026-11-29",
    name: "Prayer",
    active: true
  }
];

test("two approved events on the same day require selection", () => {
  const result = resolveVisitorEventContext({
    date: "2026-11-29",
    approvedEvents: events
  });

  assert.equal(result.status, "selection_required");

  if (result.status === "selection_required") {
    assert.equal(result.options.length, 2);
  }
});

test("selected approved event retains its canonical ID", () => {
  const result = resolveVisitorEventContext({
    date: "2026-11-29",
    selectedEventId: "prayer-2026-11-29",
    approvedEvents: events
  });

  assert.deepEqual(result, {
    status: "resolved",
    serviceId: "prayer-2026-11-29",
    name: "Prayer"
  });
});

test("unknown or inactive events are rejected", () => {
  const unknown = resolveVisitorEventContext({
    date: "2026-11-29",
    selectedEventId: "invented-event",
    approvedEvents: events
  });

  assert.equal(unknown.status, "invalid_event");

  const inactive = resolveVisitorEventContext({
    date: "2026-11-29",
    selectedEventId: "inactive-event",
    approvedEvents: [
      ...events,
      {
        id: "inactive-event",
        date: "2026-11-29",
        name: "Inactive",
        active: false
      }
    ]
  });

  assert.equal(inactive.status, "invalid_event");
});

test("unscheduled days permit general attendance", () => {
  const result = resolveVisitorEventContext({
    date: "2026-11-30",
    approvedEvents: events
  });

  assert.deepEqual(result, {
    status: "resolved",
    serviceId: "visit-2026-11-30",
    name: "General Visit"
  });
});

test("invalid dates and duplicate approved IDs fail closed", () => {
  assert.equal(
    resolveVisitorEventContext({
      date: "2026-02-30",
      approvedEvents: []
    }).status,
    "invalid_event"
  );

  assert.equal(
    resolveVisitorEventContext({
      date: "2026-13-01",
      approvedEvents: []
    }).status,
    "invalid_event"
  );

  assert.equal(
    resolveVisitorEventContext({
      date: "2026-11-29",
      approvedEvents: [...events, events[0]]
    }).status,
    "invalid_event"
  );
});