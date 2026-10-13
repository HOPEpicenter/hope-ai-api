import assert from "node:assert/strict";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import {
  classifyStaffEventCorrelationEvidence,
  inspectStaffEventCorrelationCollection,
  STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
  STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
  type StaffEventCorrelationEvidenceV1
} from "../../src/contracts/staffEventCorrelationEvidence.v1";

const bindingIdentity = {
  entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
};

function event(changes: Partial<StaffEvent> = {}): StaffEvent {
  return {
    eventId: "event-synthetic-1343",
    staffId: "staff-synthetic-1343",
    type: "staff.updated",
    occurredAt: "2026-10-12T12:00:00.000Z",
    actorId: "actor-synthetic",
    data: { displayName: "Synthetic Staff" },
    ...changes
  };
}

function metadata(
  changes: Partial<StaffEventCorrelationEvidenceV1> = {}
): StaffEventCorrelationEvidenceV1 {
  return {
    schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
    evidenceProvenance: "writer_supplied_metadata",
    operationId: "operation-synthetic-1343",
    eventId: "event-synthetic-1343",
    staffId: "staff-synthetic-1343",
    mutationCategory: "profile_update",
    expectedSecurityRevision: 0,
    resultingSecurityRevision: 1,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...changes
  };
}

function classify(
  suppliedEvent: unknown = event(),
  suppliedMetadata: unknown = metadata()
) {
  return classifyStaffEventCorrelationEvidence(
    suppliedEvent,
    suppliedMetadata
  );
}

function assertNonAuthorizing(value: {
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.securityTransactionVerified, false);
  assert.equal(value.staffEventsAppendVerified, false);
}

const valid = classify();
assert.equal(valid.status, "valid");
assertNonAuthorizing(valid);

assert.equal(classify(event(), null).status, "legacy");
assert.equal(
  classify(event(), { ...metadata(), schemaVersion: 2 }).status,
  "unsupported_schema_version"
);
assert.equal(
  classify(event(), {
    schemaVersion: 1,
    sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE
  }).status,
  "incomplete"
);
assert.equal(
  classify(event(), { ...metadata(), operationId: "not an opaque identifier" })
    .status,
  "malformed"
);
assert.equal(
  classify(event({ eventId: "different-event" })).status,
  "contradictory"
);
assert.equal(
  classify(event({ staffId: "different-staff" })).status,
  "contradictory"
);
assert.equal(
  classify(
    event({ data: { entraTenantId: bindingIdentity.entraTenantId,
      entraObjectId: bindingIdentity.entraObjectId } }),
    metadata({ mutationCategory: "status_transition" })
  ).status,
  "contradictory"
);
assert.equal(
  classify(event(), metadata({ expectedSecurityRevision: -1 })).status,
  "malformed"
);
assert.equal(
  classify(
    event(),
    metadata({
      expectedSecurityRevision: Number.MAX_SAFE_INTEGER,
      resultingSecurityRevision: Number.MAX_SAFE_INTEGER + 1
    })
  ).status,
  "malformed"
);
assert.equal(
  classify(
    event(),
    metadata({
      expectedSecurityRevision: 4,
      resultingSecurityRevision: 6
    })
  ).status,
  "contradictory"
);
assert.equal(
  classify(
    event(),
    metadata({
      previousStaffState: "revoked",
      resultingStaffState: "active"
    })
  ).status,
  "contradictory"
);
assert.equal(
  classify(event(), metadata({ mutationCategory: "unknown" as never })).status,
  "malformed"
);

const bindingEvent = event({
  data: {
    entraTenantId: bindingIdentity.entraTenantId,
    entraObjectId: bindingIdentity.entraObjectId
  }
});
const bindingMetadata = metadata({
  mutationCategory: "binding_change",
  binding: { identity: bindingIdentity, transition: "acquire" }
});
assert.equal(classify(bindingEvent, bindingMetadata).status, "valid");
assert.equal(
  classify(bindingEvent, metadata({ mutationCategory: "binding_change" }))
    .status,
  "incomplete"
);
assert.equal(
  classify(
    bindingEvent,
    metadata({
      mutationCategory: "binding_change",
      binding: {
        identity: { ...bindingIdentity, entraTenantId: "invalid-guid" },
        transition: "acquire"
      }
    })
  ).status,
  "malformed"
);

const releaseEvent = event({
  data: { entraTenantId: null, entraObjectId: null }
});
const releaseMetadata = metadata({
  mutationCategory: "binding_change",
  binding: {
    identity: bindingIdentity,
    transition: "release",
    expectedOwnerStaffId: "staff-synthetic-1343"
  }
});
assert.equal(classify(releaseEvent, releaseMetadata).status, "valid");
assert.equal(
  classify(releaseEvent, metadata({
    mutationCategory: "binding_change",
    binding: {
      identity: bindingIdentity,
      transition: "release",
      expectedOwnerStaffId: "different-owner"
    }
  })).status,
  "contradictory"
);

const exactReplay = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  { event: event(), metadata: metadata() }
]);
assert.equal(exactReplay.status, "identical_replay");
assert.ok(exactReplay.diagnostics.includes("identical_replay_in_supplied_collection"));
assertNonAuthorizing(exactReplay);

const independentStaffRevisions = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  {
    event: event({
      eventId: "event-independent-staff",
      staffId: "staff-independent-synthetic"
    }),
    metadata: metadata({
      operationId: "operation-independent-staff",
      eventId: "event-independent-staff",
      staffId: "staff-independent-synthetic"
    })
  }
]);
assert.equal(independentStaffRevisions.status, "consistent");
assert.equal(independentStaffRevisions.diagnostics.length, 0);
assert.equal(independentStaffRevisions.results.length, 2);
assert.equal("historicalEventsInspected" in independentStaffRevisions, false);
assert.equal("currentSecurityHead" in independentStaffRevisions, false);
assertNonAuthorizing(independentStaffRevisions);

const operationConflict = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  {
    event: event({
      eventId: "second-event",
      occurredAt: "2026-10-12T12:01:00.000Z"
    }),
    metadata: metadata({
      eventId: "second-event",
      expectedSecurityRevision: 1,
      resultingSecurityRevision: 2
    })
  }
]);
assert.equal(operationConflict.status, "contradictory");
const eventConflict = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  {
    event: event({ data: { displayName: "Conflicting replay" } }),
    metadata: metadata({ operationId: "different-operation" })
  }
]);
assert.equal(eventConflict.status, "contradictory");
assertNonAuthorizing(eventConflict);

const timestampOrder = inspectStaffEventCorrelationCollection([
  {
    event: event({ occurredAt: "2026-10-12T12:05:00.000Z" }),
    metadata: metadata({
      expectedSecurityRevision: 0,
      resultingSecurityRevision: 1
    })
  },
  {
    event: event({
      eventId: "event-next",
      occurredAt: "2026-10-12T12:04:00.000Z"
    }),
    metadata: metadata({
      operationId: "operation-next",
      eventId: "event-next",
      expectedSecurityRevision: 1,
      resultingSecurityRevision: 2
    })
  }
]);
assert.equal(timestampOrder.status, "consistent");
assert.ok(timestampOrder.diagnostics.includes("timestamps_not_revision_ordered"));
assertNonAuthorizing(timestampOrder);

const revisionGap = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  {
    event: event({
      eventId: "event-after-gap",
      occurredAt: "2026-10-12T12:02:00.000Z"
    }),
    metadata: metadata({
      operationId: "operation-after-gap",
      eventId: "event-after-gap",
      expectedSecurityRevision: 2,
      resultingSecurityRevision: 3
    })
  }
]);
assert.equal(revisionGap.status, "incomplete");
assert.ok(revisionGap.diagnostics.includes(
  "security_revision_gap_in_supplied_collection"
));

const replayWithMalformed = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  { event: event(), metadata: metadata() },
  {
    event: event({ eventId: "event-malformed" }),
    metadata: { ...metadata(), operationId: "" }
  }
]);
assert.equal(replayWithMalformed.status, "malformed");
assert.ok(replayWithMalformed.diagnostics.includes(
  "identical_replay_in_supplied_collection"
));
assertNonAuthorizing(replayWithMalformed);

const replayWithUnsupportedSchema = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  { event: event(), metadata: metadata() },
  {
    event: event({ eventId: "event-unsupported" }),
    metadata: { ...metadata(), schemaVersion: 2 }
  }
]);
assert.equal(replayWithUnsupportedSchema.status, "unsupported_schema_version");
assert.ok(replayWithUnsupportedSchema.diagnostics.includes(
  "identical_replay_in_supplied_collection"
));
assertNonAuthorizing(replayWithUnsupportedSchema);

const replayWithRevisionGap = inspectStaffEventCorrelationCollection([
  { event: event(), metadata: metadata() },
  { event: event(), metadata: metadata() },
  {
    event: event({
      eventId: "event-revision-gap",
      occurredAt: "2026-10-12T12:02:00.000Z"
    }),
    metadata: metadata({
      operationId: "operation-revision-gap",
      eventId: "event-revision-gap",
      expectedSecurityRevision: 2,
      resultingSecurityRevision: 3
    })
  }
]);
assert.equal(replayWithRevisionGap.status, "incomplete");
assert.ok(replayWithRevisionGap.diagnostics.includes(
  "identical_replay_in_supplied_collection"
));
assert.ok(replayWithRevisionGap.diagnostics.includes(
  "security_revision_gap_in_supplied_collection"
));
assertNonAuthorizing(replayWithRevisionGap);

assert.equal(valid.securityTransactionVerified, false);
assert.equal(valid.staffEventsAppendVerified, false);
assert.equal(classify(null, metadata()).status, "incomplete");
assert.equal(classify(null, metadata()).staffEventsAppendVerified, false);
const receiptWithoutEvent = {
  schemaVersion: 1,
  source: "staff-operation-correlation-prototype-v1",
  operationId: "operation-synthetic-1343",
  eventId: "event-synthetic-1343",
  staffId: "staff-synthetic-1343",
  mutationCategory: "profile_update",
  expectedRevision: 0,
  resultingRevision: 1,
  previousStaffState: "active",
  resultingStaffState: "active",
  outcome: "committed"
};
assert.equal(classify(null, receiptWithoutEvent).status, "incomplete");
assert.equal(
  classify(null, receiptWithoutEvent).staffEventsAppendVerified,
  false
);

for (const outcome of [
  classify(event(), null),
  classify(event(), { ...metadata(), schemaVersion: 9 }),
  classify(event(), { schemaVersion: 1 }),
  classify(event(), { ...metadata(), operationId: "" }),
  classify(event(), metadata({ resultingSecurityRevision: 3 })),
  classify(bindingEvent, metadata({
    mutationCategory: "binding_change",
    binding: {
      identity: bindingIdentity,
      transition: "release",
      expectedOwnerStaffId: "wrong-owner"
    }
  }))
]) {
  assertNonAuthorizing(outcome);
}
assertNonAuthorizing(revisionGap);
