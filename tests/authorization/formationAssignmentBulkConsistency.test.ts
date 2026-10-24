import assert from "node:assert/strict";
import {
  assessPersistedFormationAssignmentEvidence
} from "../../src/services/authorization/assessPersistedFormationAssignmentEvidence";
import {
  resolveTrustedStaffVisitorAssignmentScope
} from "../../src/services/authorization/resolveTrustedStaffVisitorAssignmentScope";

/**
 * Synthetic demonstration of a known writer-participation gap.
 *
 * The canonical event history does not capture direct bulk profile writes.
 * Neither a valid event shape nor a matching projection proves authoritative,
 * complete or fresh assignment evidence.
 *
 * No live storage, real visitor records, or HTTP endpoints are accessed.
 */

const visitorId = "synthetic-visitor";
const previousStaff = "synthetic-staff-a";
const currentStaff = "synthetic-staff-b";
const occurredAt = "2026-01-01T00:00:00.000Z";
const eventId = "synthetic-assignment-1";

const persistedEvent = {
  partitionKey: visitorId,
  rowKey: `${occurredAt}__${eventId}`,
  visitorId,
  type: "FOLLOWUP_ASSIGNED",
  occurredAt,
  idempotencyKey: eventId,
  metadata: JSON.stringify({
    source: {
      system: "synthetic-test",
      actorId: "synthetic-actor"
    },
    data: { assigneeId: previousStaff }
  })
};

// Represents the effect of a direct bulk profile replacement.
// This is synthetic state, not an actual storage mutation.
const profileAfterBulkReassignment = {
  partitionKey: "VISITOR",
  rowKey: visitorId,
  visitorId,
  assignedTo: currentStaff
};

assert.notEqual(
  JSON.parse(persistedEvent.metadata).data.assigneeId,
  profileAfterBulkReassignment.assignedTo,
  "Bulk profile change can disagree with retained assignment event"
);

const assessment = assessPersistedFormationAssignmentEvidence(
  visitorId,
  [persistedEvent]
);

assert.equal(
  assessment.status,
  "structurally_valid",
  "Internally consistent event shapes cannot detect an omitted bulk write"
);

assert.equal(assessment.authoritative, false);
assert.equal(assessment.complete, false);
assert.equal(assessment.authorizationPermitted, false);

const canonicalEvents = [{
  visitorId,
  type: "FOLLOWUP_ASSIGNED",
  occurredAt,
  eventId,
  data: { assigneeId: previousStaff }
}];

assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(previousStaff, {
    complete: assessment.complete,
    events: canonicalEvents
  }),
  [],
  "Previous staff must not gain scope from unproven event completeness"
);

assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(currentStaff, {
    complete: assessment.complete,
    events: canonicalEvents
  }),
  [],
  "Current profile assignee must not gain scope from incomplete evidence"
);

assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(previousStaff, {
    complete: false,
    events: canonicalEvents
  }),
  [],
  "A synthetic direct profile write does not establish an event snapshot"
);

// The resolver deliberately trusts a complete:true assertion.
// This assertion demonstrates why callers must NEVER invent that claim.
assert.deepEqual(
  resolveTrustedStaffVisitorAssignmentScope(previousStaff, {
    complete: true,
    events: canonicalEvents
  }),
  [visitorId],
  "An unsupported completeness claim would incorrectly retain old scope"
);

console.log(
  "Synthetic bulk assignment consistency boundary assertions passed."
);