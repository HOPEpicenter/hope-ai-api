import assert from "node:assert/strict";

function compareEventOrder(
  occurredAtA?: string | null,
  eventIdA?: string | null,
  occurredAtB?: string | null,
  eventIdB?: string | null
): number {
  const aTime = String(occurredAtA ?? "");
  const bTime = String(occurredAtB ?? "");

  if (aTime !== bTime) {
    return aTime.localeCompare(bTime);
  }

  return String(eventIdA ?? "").localeCompare(String(eventIdB ?? ""));
}

const events = [
  {
    occurredAt: "2026-01-03T00:00:00Z",
    rowKey: "2026-01-03T00:00:00Z__evt-3"
  },
  {
    occurredAt: "2026-01-01T00:00:00Z",
    rowKey: "2026-01-01T00:00:00Z__evt-1"
  },
  {
    occurredAt: "2026-01-02T00:00:00Z",
    rowKey: "2026-01-02T00:00:00Z__evt-2"
  }
];

events.sort((a, b) =>
  compareEventOrder(
    a.occurredAt,
    a.rowKey,
    b.occurredAt,
    b.rowKey
  )
);

assert.equal(events[0].rowKey.includes("evt-1"), true);
assert.equal(events[1].rowKey.includes("evt-2"), true);
assert.equal(events[2].rowKey.includes("evt-3"), true);

console.log("formationReplayOrdering.test.ts passed");
