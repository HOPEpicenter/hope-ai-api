import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity,
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
  evaluateStaffOperationCorrelation,
  type StaffOperationCorrelationEnvelope,
  type StaffOperationCorrelationRead,
  type StaffOperationCorrelationSecurityEvidence,
  type StaffOperationCorrelationStaffEventEvidence,
  type StaffOperationCorrelationProjectionEvidence,
  type StaffOperationCorrelationBindingEvidence,
  type StaffOperationCorrelationInvitationEvidence,
  type StaffOperationCorrelationSource
} from "../../src/domain/staff/staffOperationCorrelationContract";
import type { StaffWriterCoordinationRequest } from "../../src/domain/staff/staffWriterCoordinationContract";

const binding = {
  entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
};

const request: StaffWriterCoordinationRequest = {
  mutationCategory: "binding_change",
  operationId: "operation-1339",
  eventId: "event-1339",
  expectedSecurityRevision: 40,
  expectedStaffId: "staff-1339",
  expectedStaffState: "active",
  targetStaffState: "active",
  bindingIdentity: binding
};

function observed<T>(
  sourceId: StaffOperationCorrelationSource,
  recordId: string,
  value: T,
  persistence: "durable" | "external_observation" = "durable"
): StaffOperationCorrelationRead<T> {
  return {
    status: "observed",
    sourceId,
    records: [{ recordId, persistence, value }]
  };
}

function securityEvidence(
  changes: Partial<StaffOperationCorrelationSecurityEvidence> = {}
): StaffOperationCorrelationSecurityEvidence {
  return {
    kind: "staff.operation",
    outcome: "committed",
    verification: "verified",
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    mutationCategory: request.mutationCategory,
    expectedSecurityRevision: request.expectedSecurityRevision,
    resultingSecurityRevision: request.expectedSecurityRevision + 1,
    previousStaffState: "active",
    resultingStaffState: "active",
    bindingIdentity: binding,
    ...changes
  };
}

function staffEventEvidence(
  changes: Partial<StaffOperationCorrelationStaffEventEvidence> = {}
): StaffOperationCorrelationStaffEventEvidence {
  const event: StaffEvent = {
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    type: "staff.updated",
    occurredAt: "2026-10-12T12:00:00.000Z",
    actorId: "staff-admin",
    data: {
      entraTenantId: binding.entraTenantId,
      entraObjectId: binding.entraObjectId
    }
  };
  return {
    event,
    operationId: request.operationId,
    mutationCategory: request.mutationCategory,
    expectedSecurityRevision: request.expectedSecurityRevision,
    resultingSecurityRevision: request.expectedSecurityRevision + 1,
    bindingIdentity: binding,
    ...changes
  };
}

function projectionEvidence(
  changes: Partial<StaffOperationCorrelationProjectionEvidence> = {}
): StaffOperationCorrelationProjectionEvidence {
  const identity: CanonicalStaffIdentity = {
    staffId: request.expectedStaffId,
    displayName: "Correlation Contract Test",
    roleLabel: null,
    status: "active",
    createdAt: "2026-10-12T11:00:00.000Z",
    updatedAt: "2026-10-12T12:00:00.000Z",
    lastEventId: request.eventId,
    entraTenantId: binding.entraTenantId,
    entraObjectId: binding.entraObjectId,
    email: null,
    phone: null,
    ministryAreaId: null
  };
  return {
    identity,
    operationId: request.operationId,
    mutationCategory: request.mutationCategory,
    securityRevision: request.expectedSecurityRevision + 1,
    bindingIdentity: binding,
    ...changes
  };
}

function bindingEvidence(
  changes: Partial<StaffOperationCorrelationBindingEvidence> = {}
): StaffOperationCorrelationBindingEvidence {
  return {
    staffId: request.expectedStaffId,
    tenantId: binding.entraTenantId,
    objectId: binding.entraObjectId,
    operationId: request.operationId,
    ownershipState: "active",
    securityRevision: request.expectedSecurityRevision + 1,
    ...changes
  };
}

function baseEnvelope(): StaffOperationCorrelationEnvelope {
  return {
    schemaVersion: STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
    request,
    securityOperation: observed(
      "staff_security_operation_receipts",
      "security-row-1339",
      securityEvidence()
    ),
    staffEvent: observed(
      "staff_events",
      "staff-event-row-1339",
      staffEventEvidence()
    ),
    projection: observed(
      "canonical_staff_projection",
      "projection-row-1339",
      projectionEvidence()
    ),
    bindingOwnership: observed(
      "staff_binding_ownership",
      "binding-row-1339",
      bindingEvidence()
    ),
    invitationOutcome: { status: "not_applicable" }
  };
}

function clone(
  value: StaffOperationCorrelationEnvelope
): StaffOperationCorrelationEnvelope {
  return JSON.parse(JSON.stringify(value)) as StaffOperationCorrelationEnvelope;
}

function withInvitation(): StaffOperationCorrelationEnvelope {
  const invitationRequest: StaffWriterCoordinationRequest = {
    mutationCategory: "invitation",
    operationId: request.operationId,
    eventId: request.eventId,
    expectedSecurityRevision: request.expectedSecurityRevision,
    expectedStaffId: request.expectedStaffId,
    expectedStaffState: "absent",
    targetStaffState: "pending",
    bindingIdentity: binding
  };
  const envelope = baseEnvelope();
  const event: StaffEvent = {
    eventId: invitationRequest.eventId,
    staffId: invitationRequest.expectedStaffId,
    type: "staff.invited",
    occurredAt: "2026-10-12T12:00:00.000Z",
    actorId: "staff-admin",
    data: {
      displayName: "Correlation Contract Test",
      status: "pending",
      entraTenantId: binding.entraTenantId,
      entraObjectId: binding.entraObjectId
    }
  };
  return {
    ...envelope,
    request: invitationRequest,
    securityOperation: observed(
      "staff_security_operation_receipts",
      "security-row-invitation",
      securityEvidence({
        mutationCategory: "invitation",
        previousStaffState: "absent",
        resultingStaffState: "pending"
      })
    ),
    staffEvent: observed(
      "staff_events",
      "staff-event-row-invitation",
      staffEventEvidence({
        event,
        mutationCategory: "invitation"
      })
    ),
    projection: observed(
      "canonical_staff_projection",
      "projection-row-invitation",
      projectionEvidence({
        identity: {
          ...projectionEvidence().identity,
          status: "pending"
        },
        mutationCategory: "invitation"
      })
    ),
    bindingOwnership: observed(
      "staff_binding_ownership",
      "binding-row-invitation",
      bindingEvidence()
    ),
    invitationOutcome: observed<StaffOperationCorrelationInvitationEvidence>(
      "entra_invitation_outcomes",
      "graph-outcome-invitation",
      { operationId: request.operationId, outcome: "succeeded" },
      "external_observation"
    )
  };
}

function withDurableInvitationOutcome(
  outcome: "succeeded" | "failed" | "uncertain" = "succeeded"
): StaffOperationCorrelationEnvelope {
  const envelope = withInvitation();
  return {
    ...envelope,
    invitationOutcome: observed<StaffOperationCorrelationInvitationEvidence>(
      "entra_invitation_outcomes",
      "durable-local-graph-outcome",
      { operationId: request.operationId, outcome },
      "durable"
    )
  };
}

type Case = Readonly<{
  name: string;
  expected: string;
  make: () => unknown;
}>;

function assertNonAuthorizing(
  result: ReturnType<typeof evaluateStaffOperationCorrelation>
): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
}

const cases: readonly Case[] = [
  {
    name: "complete enriched synthetic evidence",
    expected: "complete",
    make: () => baseEnvelope()
  },
  {
    name: "legacy persisted security receipt lacks cross-store fields",
    expected: "stale_historical",
    make: () => {
      const envelope = clone(baseEnvelope());
      const oldReceipt = {
        operationId: request.operationId,
        staffId: request.expectedStaffId,
        tenantId: binding.entraTenantId,
        objectId: binding.entraObjectId,
        kind: "binding.reserved",
        revision: request.expectedSecurityRevision + 1
      };
      return {
        ...envelope,
        securityOperation: observed(
          "staff_security_operation_receipts",
          "legacy-reservation",
          oldReceipt
        )
      };
    }
  },
  {
    name: "StaffEvents record has no durable operation ID",
    expected: "incomplete",
    make: () => {
      const envelope = clone(baseEnvelope());
      const { operationId: _operationId, ...event } =
        staffEventEvidence();
      return {
        ...envelope,
        staffEvent: observed(
          "staff_events",
          "event-without-operation",
          event
        )
      };
    }
  },
  {
    name: "projection lacks security revision and operation identity",
    expected: "incomplete",
    make: () => {
      const envelope = clone(baseEnvelope());
      const { operationId: _operationId, securityRevision: _revision,
        ...projection } = projectionEvidence();
      return {
        ...envelope,
        projection: observed(
          "canonical_staff_projection",
          "projection-without-correlation",
          projection
        )
      };
    }
  },
  {
    name: "missing event ID",
    expected: "incomplete",
    make: () => {
      const envelope = clone(baseEnvelope());
      const event = staffEventEvidence();
      return {
        ...envelope,
        staffEvent: observed(
          "staff_events",
          "event-missing-id",
          {
            ...event,
            event: { ...event.event, eventId: undefined }
          }
        )
      };
    }
  },
  {
    name: "mismatched event ID",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      const event = staffEventEvidence();
      return {
        ...envelope,
        staffEvent: observed(
          "staff_events",
          "event-wrong-id",
          {
            ...event,
            event: { ...event.event, eventId: "another-event" }
          }
        )
      };
    }
  },
  {
    name: "mismatched staff identity",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        staffEvent: observed(
          "staff_events",
          "event-wrong-owner",
          staffEventEvidence({
            event: {
              ...staffEventEvidence().event,
              staffId: "another-staff"
            }
          })
        )
      };
    }
  },
  {
    name: "conflicting mutation category",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        staffEvent: observed(
          "staff_events",
          "event-wrong-category",
          staffEventEvidence({ mutationCategory: "profile_update" })
        )
      };
    }
  },
  {
    name: "unsupported schema version",
    expected: "contradictory",
    make: () => ({
      ...baseEnvelope(),
      schemaVersion: STAFF_OPERATION_CORRELATION_SCHEMA_VERSION + 1
    })
  },
  {
    name: "duplicate operation receipt identity",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        securityOperation: {
          status: "observed",
          sourceId: "staff_security_operation_receipts",
          records: [
            {
              recordId: "security-row-1",
              persistence: "durable",
              value: securityEvidence()
            },
            {
              recordId: "security-row-2",
              persistence: "durable",
              value: securityEvidence()
            }
          ]
        }
      };
    }
  },
  {
    name: "stale expected revision",
    expected: "stale_historical",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        securityOperation: observed(
          "staff_security_operation_receipts",
          "security-stale-revision",
          securityEvidence({
            expectedSecurityRevision:
              request.expectedSecurityRevision - 1,
            resultingSecurityRevision: request.expectedSecurityRevision
          })
        )
      };
    }
  },
  {
    name: "historical receipt and same-binding later acquisition",
    expected: "stale_historical",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        bindingOwnership: observed(
          "staff_binding_ownership",
          "binding-reacquired",
          bindingEvidence({ operationId: "later-operation" })
        )
      };
    }
  },
  {
    name: "current binding owned by another staff identity",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        bindingOwnership: observed(
          "staff_binding_ownership",
          "binding-other-owner",
          bindingEvidence({ staffId: "another-staff" })
        )
      };
    }
  },
  {
    name: "malformed Entra binding identity",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        bindingOwnership: observed(
          "staff_binding_ownership",
          "binding-invalid-entra-id",
          bindingEvidence({ tenantId: "not-a-guid" })
        )
      };
    }
  },
  {
    name: "released binding",
    expected: "stale_historical",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        bindingOwnership: observed(
          "staff_binding_ownership",
          "binding-released",
          bindingEvidence({ ownershipState: "released" })
        )
      };
    }
  },
  {
    name: "security rejected while StaffEvents appears committed",
    expected: "contradictory",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        securityOperation: observed(
          "staff_security_operation_receipts",
          "security-rejected",
          securityEvidence({ outcome: "rejected" })
        )
      };
    }
  },
  {
    name: "security committed but StaffEvents missing",
    expected: "incomplete",
    make: () => ({
      ...baseEnvelope(),
      staffEvent: { status: "missing", sourceId: "staff_events" }
    })
  },
  {
    name: "StaffEvents committed while security receipt missing",
    expected: "incomplete",
    make: () => ({
      ...baseEnvelope(),
      securityOperation: {
        status: "missing",
        sourceId: "staff_security_operation_receipts"
      }
    })
  },
  {
    name: "unknown write acknowledgement",
    expected: "uncertain",
    make: () => ({
      ...baseEnvelope(),
      staffEvent: { status: "uncertain", sourceId: "staff_events" }
    })
  },
  {
    name: "source unavailable",
    expected: "unavailable",
    make: () => ({
      ...baseEnvelope(),
      securityOperation: {
        status: "unavailable",
        sourceId: "staff_security_operation_receipts"
      }
    })
  },
  {
    name: "invitation succeeds and outcome is durably recorded",
    expected: "complete",
    make: () => withDurableInvitationOutcome()
  },
  {
    name: "invitation success with external observation only",
    expected: "incomplete",
    make: () => withInvitation()
  },
  {
    name: "Graph acknowledgement uncertain",
    expected: "uncertain",
    make: () => {
      const envelope = withInvitation();
      return {
        ...envelope,
        invitationOutcome: observed<StaffOperationCorrelationInvitationEvidence>(
          "entra_invitation_outcomes",
          "uncertain-graph-ack",
          { operationId: request.operationId, outcome: "uncertain" },
          "external_observation"
        )
      };
    }
  },
  {
    name: "invitation outcome source unavailable",
    expected: "unavailable",
    make: () => ({
      ...withInvitation(),
      invitationOutcome: {
        status: "unavailable",
        sourceId: "entra_invitation_outcomes"
      }
    })
  },
  {
    name: "invitation outcome source missing",
    expected: "incomplete",
    make: () => ({
      ...withInvitation(),
      invitationOutcome: {
        status: "missing",
        sourceId: "entra_invitation_outcomes"
      }
    })
  },
  {
    name: "invitation succeeded externally but local StaffEvents evidence is missing",
    expected: "incomplete",
    make: () => ({
      ...withInvitation(),
      staffEvent: { status: "missing", sourceId: "staff_events" }
    })
  },
  {
    name: "current binding ownership missing",
    expected: "incomplete",
    make: () => ({
      ...baseEnvelope(),
      bindingOwnership: {
        status: "missing",
        sourceId: "staff_binding_ownership"
      }
    })
  },
  {
    name: "unverified security receipt",
    expected: "incomplete",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        securityOperation: observed(
          "staff_security_operation_receipts",
          "unverified-receipt",
          securityEvidence({ verification: "unverified" })
        )
      };
    }
  },
  {
    name: "success assertion without durable receipt proof",
    expected: "contradictory",
    make: () => ({
      ...baseEnvelope(),
      securityOperation: observed(
        "staff_security_operation_receipts",
        "non-durable-success",
        securityEvidence(),
        "external_observation"
      )
    })
  },
  {
    name: "unverified rejection is not accepted as a rejection",
    expected: "incomplete",
    make: () => {
      const envelope = clone(baseEnvelope());
      return {
        ...envelope,
        securityOperation: observed(
          "staff_security_operation_receipts",
          "unverified-rejection",
          securityEvidence({
            outcome: "rejected",
            verification: "unverified"
          })
        ),
        staffEvent: {
          status: "missing",
          sourceId: "staff_events"
        },
        projection: {
          status: "missing",
          sourceId: "canonical_staff_projection"
        },
        bindingOwnership: {
          status: "missing",
          sourceId: "staff_binding_ownership"
        }
      };
    }
  },
  {
    name: "request identifiers alone and projection cannot replace source evidence",
    expected: "incomplete",
    make: () => ({
      ...baseEnvelope(),
      securityOperation: {
        status: "missing",
        sourceId: "staff_security_operation_receipts"
      },
      staffEvent: { status: "missing", sourceId: "staff_events" },
      bindingOwnership: {
        status: "missing",
        sourceId: "staff_binding_ownership"
      }
    })
  }
];

for (const testCase of cases) {
  const result = evaluateStaffOperationCorrelation(testCase.make());
  assert.equal(result.status, testCase.expected, testCase.name);
  assertNonAuthorizing(result);
}

const malformedIdentifier = evaluateStaffOperationCorrelation({
  ...baseEnvelope(),
  request: { ...request, operationId: "not a valid id" }
});
assert.equal(malformedIdentifier.status, "contradictory");
assertNonAuthorizing(malformedIdentifier);

const unknownReceiptKind = evaluateStaffOperationCorrelation({
  ...baseEnvelope(),
  securityOperation: {
    status: "observed",
    sourceId: "staff_security_operation_receipts",
    records: [{
      recordId: "unknown-kind",
      persistence: "durable",
      value: securityEvidence({ kind: "arbitrary.success" })
    }]
  }
});
assert.equal(unknownReceiptKind.status, "contradictory");
assertNonAuthorizing(unknownReceiptKind);

console.log("Staff operation correlation contract tests passed");
