import assert from "node:assert/strict";
import { buildPersonAggregate } from "../../src/domain/aggregation/buildPersonAggregate";
import { ReadinessSignal } from "../../src/domain/aggregation/phase4Contracts";

const aggregate = buildPersonAggregate({
  visitorId: "visitor-1",
  generatedAt: "2026-08-21T00:00:00.000Z",
  integratedTimeline: [
    {
      eventId: "engagement-1",
      type: "note.add",
      stream: "engagement",
      occurredAt: "2026-08-20T00:00:00.000Z",
      source: { system: "ops", actorId: "staff-1" },
      data: { noteId: "note-1", text: "Called visitor." }
    },
    {
      eventId: "formation-1",
      type: "FOLLOWUP_ASSIGNED",
      stream: "formation",
      occurredAt: "2026-08-19T00:00:00.000Z",
      data: {}
    }
  ],
  integrationSummary: {
    lastEngagementAt: "2026-08-20T00:00:00.000Z",
    lastFormationAt: "2026-08-19T00:00:00.000Z",
    lastIntegratedAt: "2026-08-20T00:00:00.000Z",
    needsFollowup: true,
    followupUrgency: "OVERDUE",
    followupResolved: false
  },
  engagementRisk: { riskLevel: "high", riskScore: 80, engagement: { engaged: false } },
  formationProfile: { stage: "Guest", assignedTo: "staff-1", lastPrayerRequestedAt: null },
  sixWeekPlan: { status: "active", needsOwner: false, nextTask: { status: "overdue", dueDate: "2026-08-20" } }
});

assert.equal(aggregate.sources.engagement, true);
assert.equal(aggregate.sources.formation, true);
assert.equal(aggregate.sources.sixWeekFollowup, true);
assert.equal(aggregate.timeline.length, 2);
assert.equal(aggregate.snapshot.formationStage, "Guest");
assert.equal(aggregate.snapshot.followupUrgency, "OVERDUE");
assert.equal(aggregate.ministryHealth.band, "NEEDS_ATTENTION");
assert.ok(aggregate.readiness.some(item => item.signal === ReadinessSignal.ENGAGEMENT_RISK_HIGH));
assert.ok(aggregate.readiness.some(item => item.signal === ReadinessSignal.FOLLOWUP_OVERDUE));
assert.ok(aggregate.readiness.some(item => item.signal === ReadinessSignal.SIX_WEEK_TASK_OVERDUE));

console.log("buildPersonAggregate.test.ts passed");