import assert from "node:assert/strict";

function normalizeActivityFamily(item: any): string {
  const type = String(item?.type ?? "").trim();

  if (type === "NEXT_STEP_SELECTED") return "next_step_selected";
  if (type === "NEXT_STEP_COMPLETED") return "next_step_completed";
  if (type === "status.transition") return "status_transition";
  if (type === "note.add") return "note_add";

  if (type.startsWith("FOLLOWUP_")) return type.toLowerCase();

  return type.toLowerCase() || "unknown";
}

function shouldSkipDedupe(item: any): boolean {
  const family = normalizeActivityFamily(item);

  return family === "next_step_selected" ||
    family === "status_transition" ||
    family === "note_add";
}

function dedupeMergedActivityItems(items: any[]): any[] {
  const seenEventIds = new Set<string>();
  const seen = new Set<string>();
  const result: any[] = [];

  for (const item of items) {
    const eventId = String(item?.eventId ?? "").trim();

    if (eventId) {
      if (seenEventIds.has(eventId)) {
        continue;
      }

      seenEventIds.add(eventId);
    }

    if (shouldSkipDedupe(item)) {
      result.push(item);
      continue;
    }

    const key = [
      item.visitorId,
      item.occurredAt,
      normalizeActivityFamily(item)
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

const items = [
  {
    eventId: "evt-1",
    visitorId: "visitor-1",
    occurredAt: "2026-01-01T00:00:00Z",
    type: "FOLLOWUP_ASSIGNED"
  },
  {
    eventId: "evt-2",
    visitorId: "visitor-1",
    occurredAt: "2026-01-01T00:00:00Z",
    type: "FOLLOWUP_ASSIGNED"
  },
  {
    eventId: "evt-3",
    visitorId: "visitor-1",
    occurredAt: "2026-01-01T00:00:00Z",
    type: "status.transition"
  }
];

const deduped = dedupeMergedActivityItems(items);

assert.equal(deduped.length, 2);

assert.equal(
  deduped.filter(x => x.type === "FOLLOWUP_ASSIGNED").length,
  1,
  "followup duplicates should collapse"
);

assert.equal(
  deduped.filter(x => x.type === "status.transition").length,
  1,
  "status transitions should never dedupe away"
);

console.log("integrationDedupe.test.ts passed");
