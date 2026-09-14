import assert from "node:assert/strict";
import { deriveSixWeekRetentionSummary } from "../../src/services/followups/deriveSixWeekRetentionSummary";
import type { SixWeekVisitorFollowupPlan } from "../../src/domain/followups/projectSixWeekVisitorFollowup";

function plan(overrides: Partial<SixWeekVisitorFollowupPlan>): SixWeekVisitorFollowupPlan {
  return {
    schemaVersion: 1,
    planId: "plan",
    visitorId: "visitor",
    firstVisitDate: "2026-08-01",
    startedAt: "2026-08-01T00:00:00.000Z",
    startedBy: "staff-1",
    ownerStaffId: "staff-1",
    contactConsent: true,
    preferredContactMethod: "email",
    status: "active",
    needsOwner: false,
    tasks: Array.from({ length: 6 }, (_, index) => ({
      weekNumber: index + 1,
      action: "Task",
      dueDate: "2026-08-01",
      status: index === 5 ? "completed" : "upcoming",
      completedAt: null,
      completedBy: null,
      contactMethod: index === 5 ? "email" : null,
      careOutcome: index === 5 ? "connected" : null,
      outcome: null,
      notes: null
    })),
    nextTask: null,
    completedTaskCount: 0,
    remainingTaskCount: 6,
    lastEventId: "event-1",
    lastEventAt: "2026-08-01T00:00:00.000Z",
    pausedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    ...overrides
  };
}

const summary = deriveSixWeekRetentionSummary([
  plan({ status: "active", nextTask: { ...plan({}).tasks[0], status: "overdue" } }),
  plan({ visitorId: "visitor-2", status: "paused", needsOwner: true, tasks: plan({}).tasks.map((task, index) => index === 5 ? { ...task, status: "completed", contactMethod: "email", careOutcome: null } : task) }),
  plan({ visitorId: "visitor-3", status: "completed", tasks: plan({}).tasks.map((task, index) => index === 5 ? { ...task, careOutcome: "closed" } : task) })
], "2026-09-14T00:00:00.000Z");

assert.equal(summary.planCount, 3);
assert.equal(summary.active, 1);
assert.equal(summary.paused, 1);
assert.equal(summary.completed, 1);
assert.equal(summary.needsOwner, 1);
assert.equal(summary.overdue, 1);
assert.equal(summary.week6Connected, 1);
assert.equal(summary.week6Closed, 1);
assert.equal(summary.week6PendingOutcome, 1);
console.log("deriveSixWeekRetentionSummary.test.ts passed");
