import assert from "node:assert/strict";

function toTicksDescending(iso: string): string {
  const ms = Date.parse(iso);
  const safeMs = Number.isFinite(ms) ? ms : 0;

  const max = 9999999999999;
  const desc = Math.max(0, max - safeMs);

  return String(desc).padStart(13, "0");
}

function buildRowKey(item: {
  occurredAt: string;
  eventId: string;
}): string {
  return `${toTicksDescending(item.occurredAt)}|${item.eventId}`;
}

const older = buildRowKey({
  occurredAt: "2026-01-01T00:00:00Z",
  eventId: "evt-1"
});

const newer = buildRowKey({
  occurredAt: "2026-01-02T00:00:00Z",
  eventId: "evt-2"
});

assert.equal(
  newer < older,
  true,
  "newer global timeline row keys must sort first lexicographically"
);

console.log("globalTimelineRepository.test.ts passed");
