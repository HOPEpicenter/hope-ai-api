import assert from "node:assert/strict";
import {
  resolveTrustedStaffVisitorAssignmentScope,
  type TrustedFormationAssignmentEvent
} from "../../src/services/authorization/resolveTrustedStaffVisitorAssignmentScope";

const STAFF = "staff-verified-1";
const OTHER = "staff-verified-2";

function event(
  visitorId: string,
  type: string,
  occurredAt: string,
  eventId: string,
  assigneeId?: unknown
): TrustedFormationAssignmentEvent {
  return {
    visitorId,
    type,
    occurredAt,
    eventId,
    data: type === "FOLLOWUP_ASSIGNED" ? { assigneeId } : {}
  };
}

function assigned(
  visitorId: string,
  at: string,
  eventId: string,
  owner: unknown = STAFF
): TrustedFormationAssignmentEvent {
  return event(visitorId, "FOLLOWUP_ASSIGNED", at, eventId, owner);
}

function unassigned(
  visitorId: string,
  at: string,
  eventId: string
): TrustedFormationAssignmentEvent {
  return event(visitorId, "FOLLOWUP_UNASSIGNED", at, eventId);
}

function scope(
  events: readonly TrustedFormationAssignmentEvent[],
  staffId = STAFF,
  complete = true
): string[] {
  return resolveTrustedStaffVisitorAssignmentScope(staffId, {
    complete,
    events
  });
}

const DAY1 = "2026-01-01T00:00:00.000Z";
const DAY2 = "2026-01-02T00:00:00.000Z";
const DAY3 = "2026-01-03T00:00:00.000Z";

assert.deepEqual(
  scope([assigned("visitor-a", DAY1, "event-1")]),
  ["visitor-a"],
  "Current canonical assignment grants scope"
);

assert.deepEqual(
  scope([
    assigned("visitor-b", DAY1, "event-1", OTHER),
    assigned("visitor-a", DAY1, "event-2", STAFF)
  ]),
  ["visitor-a"],
  "Only the verified staff member's assignments are returned"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1"),
    unassigned("visitor-a", DAY2, "event-2")
  ]),
  [],
  "Unassignment immediately revokes scope"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1"),
    assigned("visitor-a", DAY2, "event-2", OTHER)
  ]),
  [],
  "Reassignment revokes the previous owner"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1", OTHER),
    assigned("visitor-a", DAY2, "event-2", STAFF)
  ]),
  ["visitor-a"],
  "Current assignment grants the new owner"
);

assert.deepEqual(
  scope([
    unassigned("visitor-a", DAY2, "event-2"),
    assigned("visitor-a", DAY1, "event-1")
  ]),
  [],
  "Historical assignment cannot override newer unassignment"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1"),
    unassigned("visitor-a", DAY2, "event-2"),
    assigned("visitor-a", DAY3, "event-3")
  ]),
  ["visitor-a"],
  "A new assignment after revocation can establish scope"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY2, "event-1"),
    unassigned("visitor-a", DAY2, "event-2")
  ]),
  [],
  "Same-timestamp assignment and unassignment must deny"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY2, "event-1"),
    assigned("visitor-a", DAY2, "event-2", OTHER)
  ]),
  [],
  "Conflicting owners at the latest timestamp must deny"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1"),
    assigned("visitor-a", DAY1, "event-2"),
    assigned("visitor-a", DAY2, "event-3")
  ]),
  ["visitor-a"],
  "Older timestamp collisions do not override unambiguous latest evidence"
);

assert.deepEqual(
  scope([
    assigned("visitor-a", DAY1, "event-1"),
    assigned("visitor-a", DAY2, "event-1")
  ]),
  [],
  "Duplicate event identifiers for a visitor must deny"
);

for (const malformedOwner of [
  "",
  " ",
  ` ${STAFF}`,
  `${STAFF} `,
  null,
  42
]) {
  assert.deepEqual(
    scope([assigned("visitor-a", DAY1, "event-1", malformedOwner)]),
    [],
    "Malformed assignee evidence must deny"
  );
}

for (const malformedTimestamp of [
  "not-a-date",
  "0",
  "2026-01-01",
  "2026-01-01T00:00:00Z",
  "2026-01-01T00:00:00.000+00:00",
  "2026-02-30T00:00:00.000Z",
  " 2026-01-01T00:00:00.000Z"
]) {
  assert.deepEqual(
    scope([assigned("visitor-a", malformedTimestamp, "event-1")]),
    [],
    "Noncanonical or invalid timestamps must deny"
  );
}

assert.deepEqual(
  scope([assigned("visitor-a", DAY1, "")]),
  [],
  "Missing event identity must deny"
);

assert.deepEqual(
  scope([assigned(" visitor-a", DAY1, "event-1")]),
  [],
  "Malformed visitor identity must deny"
);

assert.deepEqual(
  scope([assigned("visitor-a", DAY1, "event-1")], STAFF, false),
  [],
  "Incomplete event evidence must deny"
);

assert.deepEqual(
  scope([assigned("visitor-a", DAY1, "event-1")], ""),
  [],
  "Unverified empty staff identity must deny"
);

assert.deepEqual(
  scope([assigned("visitor-a", DAY1, "event-1")], ` ${STAFF}`),
  [],
  "Padded staff identity must deny"
);

assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(STAFF, null as never),
  [],
  "Missing evidence must deny"
);

assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(
    STAFF,
    { complete: true, events: null } as never
  ),
  [],
  "Invalid event collection must deny"
);

assert.deepEqual(
  scope([
    assigned("visitor-z", DAY1, "event-3"),
    assigned("visitor-a", DAY1, "event-1"),
    assigned("visitor-m", DAY1, "event-2")
  ]),
  ["visitor-a", "visitor-m", "visitor-z"],
  "Scope must be sorted deterministically"
);

const largeHistoryEvents: TrustedFormationAssignmentEvent[] =
  Array.from({ length: 150000 }, (_, index) => ({
    visitorId: "synthetic-large-history",
    type: "FOLLOWUP_ASSIGNED",
    occurredAt: DAY1,
    eventId: `large-event-${index}`,
    data: { assigneeId: STAFF }
  }));

assert.deepEqual(
  scope(largeHistoryEvents),
  [],
  "Large same-timestamp history must deny ambiguity without throwing"
);

assert.deepEqual(
  scope([
    ...largeHistoryEvents,
    assigned("synthetic-large-history", DAY2, "large-event-latest")
  ]),
  ["synthetic-large-history"],
  "Large history with unique latest assignment must resolve safely"
);
console.log("resolveTrustedStaffVisitorAssignmentScope.test.ts passed");
