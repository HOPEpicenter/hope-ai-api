import assert from "node:assert/strict";
import {
  projectSixWeekVisitorFollowup
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";

const plan = projectSixWeekVisitorFollowup(
  [
    {
      eventId: "plan-started",
      visitorId: "visitor-care-outcome",
      type: "six_week_followup.plan_started",
      occurredAt: "2026-08-01T00:00:00.000Z",
      actorId: "staff-1",
      data: {
        firstVisitDate: "2026-08-01",
        ownerStaffId: "staff-1",
        contactConsent: true
      }
    },
    {
      eventId: "week-six-completed",
      visitorId: "visitor-care-outcome",
      type: "six_week_followup.task_completed",
      occurredAt: "2026-08-25T00:00:00.000Z",
      actorId: "staff-1",
      data: {
        weekNumber: 6,
        contactMethod: "in_person",
        careOutcome: "connected",
        outcome: "Visitor is connected."
      }
    }
  ],
  "2026-08-25T00:00:00.000Z"
);

assert.ok(plan);
assert.equal(plan.tasks[5].careOutcome, "connected");
assert.equal(plan.tasks[0].careOutcome, null);

console.log("projectSixWeekCareOutcomeProjection.test.ts passed");
