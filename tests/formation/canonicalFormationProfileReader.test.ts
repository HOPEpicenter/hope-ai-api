import assert from "node:assert/strict";
import { CanonicalFormationProfileReader } from "../../src/services/formation/canonicalFormationProfileReader";

const memberId = "member-canonical";
const reader = new CanonicalFormationProfileReader({
  async listByMemberId() {
    return [
      {
        id: "event-completed",
        type: "PathwayCompleted",
        occurredAt: "2026-09-04T00:00:00.000Z",
        metadata: JSON.stringify({
          pathwayId: "pathway-1",
          completedAt: "2026-09-04T00:00:00.000Z",
          finalStepId: "commissioned"
        })
      },
      { id: "malformed", type: "PathwayStarted", occurredAt: "2026-09-01T00:00:00.000Z" },
      {
        id: "event-step",
        type: "StepCompleted",
        occurredAt: "2026-09-02T00:00:00.000Z",
        metadata: JSON.stringify({
          pathwayId: "pathway-1",
          stepId: "welcome",
          completedAt: "2026-09-02T00:00:00.000Z"
        })
      },
      {
        id: "event-started",
        type: "PathwayStarted",
        occurredAt: "2026-09-01T00:00:00.000Z",
        metadata: {
          pathwayId: "pathway-1",
          pathwayType: "new-believer",
          startedAt: "2026-09-01T00:00:00.000Z",
          initialStepId: "welcome"
        }
      },
      {
        id: "event-stalled",
        type: "StepStalledDetected",
        occurredAt: "2026-09-03T00:00:00.000Z",
        metadata: JSON.stringify({
          pathwayId: "pathway-1",
          stepId: "group",
          stalledSince: "2026-09-03T00:00:00.000Z"
        })
      }
    ];
  }
});

async function run(): Promise<void> {
  const result = await reader.readByMemberId(memberId);
  assert.equal(result.hasQualifyingEvents, true);
  assert.equal(result.profile.activePathway, null);
  assert.deepEqual(result.profile.history[0]?.steps.map((step) => step.stepId), ["welcome", "group"]);
  assert.equal(result.profile.history[0]?.status, "completed");

  const emptyReader = new CanonicalFormationProfileReader({
    async listByMemberId() {
      return [];
    }
  });
  const empty = await emptyReader.readByMemberId("member-empty");
  assert.equal(empty.hasQualifyingEvents, false);
  assert.equal(empty.profile.memberId, "member-empty");
  assert.equal(empty.profile.lastUpdatedAt, null);

  console.log("canonicalFormationProfileReader.test.ts passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});