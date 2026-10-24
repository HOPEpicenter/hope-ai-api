import assert from "node:assert/strict";
import {
  assessPersistedFormationAssignmentEvidence
} from "../../src/services/authorization/assessPersistedFormationAssignmentEvidence";

const visitorId = "synthetic-visitor";
const occurredAt = "2026-10-24T12:00:00.000Z";

function event(
  eventId: string,
  type = "FOLLOWUP_ASSIGNED",
  data: Record<string, unknown> = { assigneeId: "synthetic-staff" }
): Record<string, unknown> {
  return {
    partitionKey: visitorId,
    visitorId,
    rowKey: `${occurredAt}__${eventId}`,
    idempotencyKey: eventId,
    type,
    occurredAt,
    metadata: JSON.stringify({
      source: { system: "synthetic-test" },
      data
    })
  };
}

function blocked(
  records: unknown,
  reason: string
): void {
  const assessment =
    assessPersistedFormationAssignmentEvidence(visitorId, records);

  assert.equal(assessment.status, "blocked");
  assert.equal(assessment.reason, reason);
  assert.equal(assessment.authoritative, false);
  assert.equal(assessment.complete, false);
  assert.equal(assessment.authorizationPermitted, false);
}

const valid = assessPersistedFormationAssignmentEvidence(
  visitorId,
  [
    event("assignment-1"),
    event("unassignment-2", "FOLLOWUP_UNASSIGNED", {}),
    event("other-3", "NEXT_STEP_SELECTED", {})
  ]
);

assert.deepEqual(valid, {
  status: "structurally_valid",
  reason: "record_shapes_valid_non_authorizing",
  authoritative: false,
  complete: false,
  authorizationPermitted: false
});

const empty = assessPersistedFormationAssignmentEvidence(visitorId, []);
assert.equal(empty.status, "structurally_valid");
assert.equal(empty.complete, false);
assert.equal(empty.authorizationPermitted, false);

blocked(null, "invalid_input");
blocked([null], "invalid_record");
blocked([{ ...event("a"), partitionKey: "another-visitor" }], "wrong_visitor");
blocked([{ ...event("a"), visitorId: "another-visitor" }], "wrong_visitor");
blocked([{ ...event("a"), rowKey: "incorrect" }], "invalid_event_identity");
blocked([{ ...event("a"), idempotencyKey: " " }], "invalid_event_identity");
blocked(
  [{ ...event("a"), occurredAt: "2026-10-24T12:00:00Z" }],
  "invalid_event_identity"
);
blocked(
  [{ ...event("a"), occurredAt: "2026-02-30T12:00:00.000Z" }],
  "invalid_event_identity"
);
blocked([event("same"), event("same")], "duplicate_event_id");
blocked(
  [{ ...event("a"), metadata: "{bad-json" }],
  "invalid_assignment_metadata"
);
blocked(
  [event("a", "FOLLOWUP_ASSIGNED", {})],
  "invalid_assignment_metadata"
);
blocked(
  [event("a", "FOLLOWUP_ASSIGNED", { assigneeId: " " })],
  "invalid_assignment_metadata"
);
blocked(
  [{ ...event("a"), metadata: JSON.stringify({ data: null }) }],
  "invalid_assignment_metadata"
);
blocked(
  Array.from({ length: 10001 }, (_, i) => event(`event-${i}`)),
  "excessive_records"
);

// A syntactically valid record never proves authenticity or freshness.
const forgedButWellFormed = assessPersistedFormationAssignmentEvidence(
  visitorId,
  [event("synthetic-untrusted-input")]
);
assert.equal(forgedButWellFormed.status, "structurally_valid");
assert.equal(forgedButWellFormed.authoritative, false);
assert.equal(forgedButWellFormed.complete, false);
assert.equal(forgedButWellFormed.authorizationPermitted, false);

console.log("Formation assignment evidence validation assertions passed.");

// STEP 453 - Additional synthetic security boundaries

blocked(
  [{ ...event("missing-metadata"), metadata: undefined }],
  "invalid_assignment_metadata"
);

blocked(
  [{ ...event("array-metadata"), metadata: "[]" }],
  "invalid_assignment_metadata"
);

blocked(
  [{ ...event("primitive-metadata"), metadata: '"text"' }],
  "invalid_assignment_metadata"
);

blocked(
  [event("null-owner", "FOLLOWUP_ASSIGNED", { assigneeId: null })],
  "invalid_assignment_metadata"
);

blocked(
  [event("number-owner", "FOLLOWUP_ASSIGNED", { assigneeId: 123 })],
  "invalid_assignment_metadata"
);

blocked(
  [
    event("duplicate-cross-type"),
    event("duplicate-cross-type", "NEXT_STEP_SELECTED", {})
  ],
  "duplicate_event_id"
);

blocked(
  [
    {
      ...event("reserved"),
      rowKey: "NEXT_STEP_CORRECTION_GUARD__reserved"
    }
  ],
  "invalid_event_identity"
);

blocked(
  [{ ...event("noncanonical"), occurredAt: "2026-10-24T12:00:00.000+00:00" }],
  "invalid_event_identity"
);

const maximumRecords = Array.from(
  { length: 10000 },
  (_, i) => event(`synthetic-boundary-${i}`)
);

const maximumAssessment =
  assessPersistedFormationAssignmentEvidence(visitorId, maximumRecords);

assert.equal(maximumAssessment.status, "structurally_valid");
assert.equal(maximumAssessment.authoritative, false);
assert.equal(maximumAssessment.complete, false);
assert.equal(maximumAssessment.authorizationPermitted, false);

const inaccessibleRecord = Object.defineProperty(
  {},
  "partitionKey",
  {
    get() {
      throw new Error("synthetic inaccessible property");
    }
  }
);

blocked([inaccessibleRecord], "invalid_input");

console.log("Additional formation assignment security boundaries passed.");