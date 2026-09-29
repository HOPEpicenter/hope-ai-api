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

// TEST 1 — completely empty new visitor: no assignee, no engagement, no formation activity.
// Absence of evidence must not fabricate an actionable followup need.
{
  const empty = deriveIntegrationSummaryV1({
    visitorId: "visitor-empty",
    lastEngagementAt: null,
    lastFormationAt: null
  });

  assert.equal(empty.needsFollowup, false, "no assignee and no engagement must not need followup");
  assert.equal(empty.followupResolved, false);
}

// TEST 2 — new visitor with an authoritative assigned follow-up, zero engagement history.
// An actual open assignment remains actionable regardless of engagement evidence.
{
  const assignedOnly = deriveIntegrationSummaryV1({
    visitorId: "visitor-assigned-only",
    lastEngagementAt: null,
    lastFormationAt: "2026-01-03T00:00:00Z",
    assignedToUserId: "ops-user-1",
    lastFollowupAssignedAt: "2026-01-03T00:00:00Z"
  });

  assert.equal(assignedOnly.needsFollowup, true, "an actual open assignment must remain actionable");
  assert.equal(assignedOnly.followupResolved, false);
}

// TEST 4 — non-terminal follow-up attempt (no_response) must remain actionable, not resolved.
{
  const nonTerminal = deriveIntegrationSummaryV1({
    visitorId: "visitor-no-response",
    lastEngagementAt: null,
    lastFormationAt: "2026-01-03T00:00:00Z",
    assignedToUserId: "ops-user-1",
    lastFollowupAssignedAt: "2026-01-03T00:00:00Z",
    lastFollowupContactedAt: "2026-01-04T00:00:00Z",
    lastFollowupOutcomeAt: "2026-01-04T00:00:00Z",
    lastFollowupOutcome: "no_response"
  });

  assert.equal(nonTerminal.followupResolved, false, "no_response is non-terminal per Followup Outcome Semantics v2");
  assert.equal(nonTerminal.needsFollowup, true, "non-terminal attempt must remain actionable");
}

// TEST 5 — terminal connected outcome resolves the follow-up.
{
  const terminal = deriveIntegrationSummaryV1({
    visitorId: "visitor-connected",
    lastEngagementAt: null,
    lastFormationAt: "2026-01-03T00:00:00Z",
    assignedToUserId: "ops-user-1",
    lastFollowupAssignedAt: "2026-01-03T00:00:00Z",
    lastFollowupContactedAt: "2026-01-04T00:00:00Z",
    lastFollowupOutcomeAt: "2026-01-05T00:00:00Z",
    lastFollowupOutcome: "connected"
  });

  assert.equal(terminal.followupResolved, true);
  assert.equal(terminal.needsFollowup, false);
}

console.log("deriveIntegrationSummary.test.ts passed");
