import assert from "node:assert/strict";
import {
  deriveIntegrationSummaryV1
} from "../../src/domain/integration/deriveIntegrationSummary.v1";

const result = deriveIntegrationSummaryV1({
  visitorId: "visitor-1",
  lastEngagementAt: "2026-01-02T00:00:00Z",
  lastFormationAt: "2026-01-03T00:00:00Z",
  assignedToUserId: "ops-user-1",
  lastFollowupAssignedAt: "2026-01-03T00:00:00Z",
  groups: [
    {
      groupId: "group-a",
      displayName: "Group A"
    }
  ]
});

assert.equal(result.lastIntegratedAt, "2026-01-03T00:00:00Z");
assert.equal(result.needsFollowup, true);
assert.equal(result.followupResolved, false);
assert.equal(result.sources.engagement, true);
assert.equal(result.sources.formation, true);

assert.equal(result.groups?.length, 1);
assert.equal(result.groups?.[0].groupId, "group-a");

console.log("deriveIntegrationSummary.test.ts passed");
