import assert from "node:assert/strict";
import {
  projectSixWeekVisitorFollowup,
  type SixWeekFollowupEvent
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";

const baseEvents: SixWeekFollowupEvent[] = [
  {
    eventId: "evt-start",
    visitorId: "visitor-1",
    type: "six_week_followup.plan_started",
    occurredAt: "2026-08-19T12:00:00.000Z",
    actorId: "staff-actor",
    data: {
      firstVisitDate: "2026-08-19",
      ownerStaffId: null,
      contactConsent: true,
      preferredContactMethod: "call"
    }
  },
  {
    eventId: "evt-owner",
    visitorId: "visitor-1",
    type: "six_week_followup.owner_assigned",
    occurredAt: "2026-08-19T12:05:00.000Z",
    actorId: "staff-actor",
    data: { ownerStaffId: "staff-owner" }
  },
  {
    eventId: "evt-week-1",
    visitorId: "visitor-1",
    type: "six_week_followup.task_completed",
    occurredAt: "2026-08-21T14:00:00.000Z",
    actorId: "staff-owner",
    data: {
      weekNumber: 1,
      contactMethod: "call",
      outcome: "Welcomed by phone",
      notes: "Visitor plans to return."
    }
  }
];

const first = projectSixWeekVisitorFollowup(
  baseEvents,
  "2026-08-22T08:00:00.000Z"
);

const second = projectSixWeekVisitorFollowup(
  [...baseEvents].reverse(),
  "2026-08-22T08:00:00.000Z"
);

assert.deepEqual(first, second);
assert(first);
assert.equal(first.ownerStaffId, "staff-owner");
assert.equal(first.needsOwner, false);
assert.equal(first.tasks.length, 6);
assert.equal(first.tasks[0].status, "completed");
assert.equal(first.tasks[0].dueDate, "2026-08-21");
assert.equal(first.tasks[1].status, "upcoming");
assert.equal(first.tasks[1].dueDate, "2026-08-26");
assert.equal(first.nextTask?.weekNumber, 2);
assert.equal(first.completedTaskCount, 1);
assert.equal(first.remainingTaskCount, 5);

const overdue = projectSixWeekVisitorFollowup(
  baseEvents,
  "2026-08-27T08:00:00.000Z"
);

assert(overdue);
assert.equal(overdue.tasks[1].status, "overdue");

const paused = projectSixWeekVisitorFollowup(
  [
    ...baseEvents,
    {
      eventId: "evt-paused",
      visitorId: "visitor-1",
      type: "six_week_followup.plan_paused",
      occurredAt: "2026-08-23T12:00:00.000Z",
      actorId: "staff-owner",
      data: { reason: "Visitor requested a pause" }
    }
  ],
  "2026-08-27T08:00:00.000Z"
);

assert(paused);
assert.equal(paused.status, "paused");
assert.equal(paused.tasks[0].status, "completed");
assert.equal(paused.tasks[1].status, "paused");

const cancelled = projectSixWeekVisitorFollowup(
  [
    ...baseEvents,
    {
      eventId: "evt-cancelled",
      visitorId: "visitor-1",
      type: "six_week_followup.plan_cancelled",
      occurredAt: "2026-08-24T12:00:00.000Z",
      actorId: "staff-owner",
      data: { reason: "Visitor requested no further contact" }
    }
  ],
  "2026-08-27T08:00:00.000Z"
);

assert(cancelled);
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.tasks[0].status, "completed");
assert.equal(cancelled.tasks[1].status, "cancelled");

const completionEvents: SixWeekFollowupEvent[] = [
  baseEvents[0],
  ...[1, 2, 3, 4, 5, 6].map(weekNumber => ({
    eventId: `evt-complete-${weekNumber}`,
    visitorId: "visitor-1",
    type: "six_week_followup.task_completed" as const,
    occurredAt: `2026-09-${String(weekNumber).padStart(2, "0")}T12:00:00.000Z`,
    actorId: "staff-owner",
    data: {
      weekNumber,
      contactMethod: "call" as const,
      outcome: `Week ${weekNumber} completed`
    }
  }))
];

const completed = projectSixWeekVisitorFollowup(
  completionEvents,
  "2026-09-10T00:00:00.000Z"
);

assert(completed);
assert.equal(completed.status, "completed");
assert.equal(completed.nextTask, null);
assert.equal(completed.completedTaskCount, 6);

const withoutConsent = projectSixWeekVisitorFollowup([
  {
    ...baseEvents[0],
    data: { ...baseEvents[0].data, contactConsent: false }
  }
]);

assert.equal(withoutConsent, null);

console.log("projectSixWeekVisitorFollowup.test.ts passed");
