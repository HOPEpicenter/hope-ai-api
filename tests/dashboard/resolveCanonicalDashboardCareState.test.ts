import assert from "node:assert/strict";
import {
  resolveCanonicalDashboardCareState
} from "../../src/services/dashboard/readCanonicalVisitorDashboardCard";

const resolved = resolveCanonicalDashboardCareState({
  followupStatus: "resolved",
  integrationNeedsFollowup: false,
  integrationFollowupResolved: true,
  riskNeedsFollowup: true,
  riskRecommendedAction: "Immediate pastoral followup recommended"
});

assert.deepEqual(resolved, {
  followupResolved: true,
  needsFollowup: false,
  recommendedAction: "Care follow-up completed"
});

console.log("resolveCanonicalDashboardCareState.test.ts passed");
