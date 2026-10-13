import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity,
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";
import {
  type StaffWriterCoordinationRequest
} from "../../src/domain/staff/staffWriterCoordinationContract";
import {
  inspectStaffWriterReconciliation,
  type StaffCurrentBindingObservation,
  type StaffEventObservation,
  type StaffInvitationOutcomeObservation,
  type StaffProjectionObservation,
  type StaffReconciliationRead,
  type StaffSecurityReceiptObservation,
  type StaffWriterReconciliationReaders
} from "../../src/services/staff/inspectStaffWriterReconciliation";

const binding = {
  entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
};

const request: StaffWriterCoordinationRequest = {
  mutationCategory: "binding_change",
  operationId: "1b2276f2-4d67-4727-84cd-65034b8a17e1",
  eventId: "evt-reconcile-1338",
  expectedSecurityRevision: 40,
  expectedStaffId: "staff-reconcile-1338",
  expectedStaffState: "active",
  targetStaffState: "active",
  bindingIdentity: binding
};

function makeSecurityReceipt(
  changes: Partial<StaffSecurityReceiptObservation> = {}
): StaffSecurityReceiptObservation {
  return {
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    tenantId: binding.entraTenantId,
    objectId: binding.entraObjectId,
    kind: "binding.reserved",
    mutationCategory: "binding_change",
    expectedRevision: request.expectedSecurityRevision,
    revision: request.expectedSecurityRevision + 1,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...changes
  };
}

function makeEvent(
  changes: Partial<StaffEvent> = {},
  operationId: string | undefined = request.operationId
): StaffEventObservation {
  const event: StaffEvent = {
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    type: "staff.updated",
    occurredAt: "2026-10-12T12:00:00.000Z",
    actorId: "staff-admin",
    data: {
      entraTenantId: binding.entraTenantId,
      entraObjectId: binding.entraObjectId
    },
    ...changes
  };
  return { event, operationId };
}

function makeProjection(
  changes: Partial<CanonicalStaffIdentity> = {},
  operationId: string | undefined = request.operationId
): StaffProjectionObservation {
  const identity: CanonicalStaffIdentity = {
    staffId: request.expectedStaffId,
    displayName: "Reconciliation Test",
    roleLabel: null,
    status: "active",
    createdAt: "2026-10-12T11:00:00.000Z",
    updatedAt: "2026-10-12T12:00:00.000Z",
    lastEventId: request.eventId,
    entraTenantId: binding.entraTenantId,
    entraObjectId: binding.entraObjectId,
    email: null,
    phone: null,
    ministryAreaId: null,
    ...changes
  };
  return {
    identity,
    operationId,
    mutationCategory: "binding_change",
    securityRevision: request.expectedSecurityRevision + 1
  };
}

function makeCurrentBinding(
  changes: Partial<StaffCurrentBindingObservation> = {}
): StaffCurrentBindingObservation {
  return {
    staffId: request.expectedStaffId,
    tenantId: binding.entraTenantId,
    objectId: binding.entraObjectId,
    operationId: request.operationId,
    ownershipState: "active",
    ...changes
  };
}

function makeReaders(options: {
  receipts?: StaffReconciliationRead<StaffSecurityReceiptObservation>;
  bindings?: StaffReconciliationRead<StaffCurrentBindingObservation>;
  events?: StaffReconciliationRead<StaffEventObservation>;
  projections?: StaffReconciliationRead<StaffProjectionObservation>;
  invitations?: StaffReconciliationRead<StaffInvitationOutcomeObservation>;
  onRead?: () => void;
} = {}): StaffWriterReconciliationReaders {
  const observed = <T>(records: readonly T[]): StaffReconciliationRead<T> => ({
    status: "observed",
    records
  });
  const defaults = {
    receipts: observed([makeSecurityReceipt()]),
    bindings: observed([makeCurrentBinding()]),
    events: observed([makeEvent()]),
    projections: observed([makeProjection()]),
    invitations: { status: "missing" } as const
  };
  const values = { ...defaults, ...options };
  const onRead = options.onRead ?? (() => {});

  return {
    async readSecurityReceipts(operationId) {
      onRead();
      assert.equal(operationId, request.operationId);
      return values.receipts;
    },
    async readCurrentBinding(tenantId, objectId) {
      onRead();
      assert.equal(tenantId, binding.entraTenantId);
      assert.equal(objectId, binding.entraObjectId);
      return values.bindings;
    },
    async readStaffEvents(eventId, staffId) {
      onRead();
      assert.equal(eventId, request.eventId);
      assert.equal(staffId, request.expectedStaffId);
      return values.events;
    },
    async readStaffProjections(staffId) {
      onRead();
      assert.equal(staffId, request.expectedStaffId);
      return values.projections;
    },
    async readInvitationOutcomes(operationId) {
      onRead();
      assert.equal(operationId, request.operationId);
      return values.invitations;
    }
  };
}

function assertNonAuthorizing(
  result: Awaited<ReturnType<typeof inspectStaffWriterReconciliation>>
): void {
  assert.equal(result.authoritative, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.contractEvaluation.authoritative, false);
  assert.equal(result.contractEvaluation.executionPermitted, false);
  assert.equal(result.contractEvaluation.retryPermitted, false);
}

async function main(): Promise<void> {
  let readCount = 0;
  const complete = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ onRead: () => { readCount += 1; } })
  );
  assert.equal(complete.status, "consistent");
  assert.equal(complete.contractEvaluation.status, "committed");
  assert.equal(complete.diagnostic, "evidence_correlated");
  assert.equal(complete.reconciliationRequired, false);
  assert.deepEqual(complete.missingEvidence, []);
  assert.equal(readCount, 4);
  assertNonAuthorizing(complete);

  const realSchemaReceipt = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: {
        status: "observed",
        records: [{
          operationId: request.operationId,
          staffId: request.expectedStaffId,
          tenantId: binding.entraTenantId,
          objectId: binding.entraObjectId,
          kind: "binding.reserved",
          revision: request.expectedSecurityRevision + 1
        }]
      },
      events: {
        status: "observed",
        records: [{
          event: makeEvent().event
        }]
      },
      projections: {
        status: "observed",
        records: [{
          identity: makeProjection().identity
        }]
      }
    })
  );
  assert.equal(realSchemaReceipt.status, "incomplete");
  assert.equal(realSchemaReceipt.contractEvaluation.status, "inconsistent");
  for (const field of [
    "security_receipt.eventId",
    "security_receipt.mutationCategory",
    "security_receipt.expectedRevision",
    "security_receipt.previousStaffState",
    "security_receipt.resultingStaffState",
    "staff_event.operationId",
    "projection.operationId",
    "projection.mutationCategory",
    "projection.securityRevision"
  ]) {
    assert.ok(realSchemaReceipt.missingEvidence.includes(field), field);
  }
  assertNonAuthorizing(realSchemaReceipt);

  const missingSecurity = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ receipts: { status: "missing" } })
  );
  assert.equal(missingSecurity.status, "missing");
  assert.equal(missingSecurity.contractEvaluation.status, "pending");
  assert.ok(missingSecurity.missingEvidence.includes("security_receipt"));
  assertNonAuthorizing(missingSecurity);

  const missingEvent = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ events: { status: "missing" } })
  );
  assert.equal(missingEvent.status, "missing");
  assert.ok(missingEvent.missingEvidence.includes("staff_event"));
  assertNonAuthorizing(missingEvent);

  const missingProjection = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ projections: { status: "missing" } })
  );
  assert.equal(missingProjection.status, "missing");
  assert.ok(missingProjection.missingEvidence.includes("projection"));
  assertNonAuthorizing(missingProjection);

  const emptyCurrentBinding = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      bindings: { status: "observed", records: [] }
    })
  );
  assert.equal(emptyCurrentBinding.status, "missing");
  assert.equal(emptyCurrentBinding.diagnostic, "source_record_missing");
  assert.ok(emptyCurrentBinding.missingEvidence.includes("current_binding"));
  assert.notEqual(emptyCurrentBinding.status, "consistent");
  assertNonAuthorizing(emptyCurrentBinding);

  const missingCurrentBinding = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ bindings: { status: "missing" } })
  );
  assert.equal(missingCurrentBinding.status, "missing");
  assert.ok(missingCurrentBinding.missingEvidence.includes("current_binding"));
  assertNonAuthorizing(missingCurrentBinding);

  const rejectedReceipt = makeSecurityReceipt({
    outcome: "rejected",
    rejectionReason: "binding_conflict"
  });
  const rejected = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: { status: "observed", records: [rejectedReceipt] },
      events: { status: "missing" },
      projections: { status: "missing" }
    })
  );
  assert.equal(rejected.status, "rejected");
  assertNonAuthorizing(rejected);

  const conflictingOperation = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: {
        status: "observed",
        records: [makeSecurityReceipt({ operationId: "other-operation" })]
      }
    })
  );
  assert.equal(conflictingOperation.status, "contradictory");
  assert.ok(conflictingOperation.missingEvidence.includes(
    "security_receipt.identity_or_revision_mismatch"
  ));
  assertNonAuthorizing(conflictingOperation);

  const bindingOwnerMismatch = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      bindings: {
        status: "observed",
        records: [makeCurrentBinding({ staffId: "staff-successor" })]
      }
    })
  );
  assert.equal(bindingOwnerMismatch.status, "contradictory");
  assert.ok(bindingOwnerMismatch.missingEvidence.includes(
    "current_binding.owner_or_identity_mismatch"
  ));
  assertNonAuthorizing(bindingOwnerMismatch);

  const malformedBindingOwnership = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      bindings: JSON.parse(JSON.stringify({
        status: "observed",
        records: [
          { ...makeCurrentBinding(), ownershipState: "pending" }
        ]
      }))
    })
  );
  assert.equal(malformedBindingOwnership.status, "contradictory");
  assert.ok(malformedBindingOwnership.missingEvidence.includes(
    "current_binding.ownershipState_malformed"
  ));
  assertNonAuthorizing(malformedBindingOwnership);

  const laterSameOwnerAcquisition =
    await inspectStaffWriterReconciliation(
      request,
      makeReaders({
        bindings: {
          status: "observed",
          records: [
            makeCurrentBinding({
              operationId: "9f6bb490-bdfc-43b1-9af3-e87762b3d091"
            })
          ]
        }
      })
    );
  assert.equal(laterSameOwnerAcquisition.status, "incomplete");
  assert.equal(
    laterSameOwnerAcquisition.diagnostic,
    "historical_security_evidence"
  );
  assert.ok(laterSameOwnerAcquisition.missingEvidence.includes(
    "current_binding.operationId_differs_from_inspected_operation"
  ));
  assertNonAuthorizing(laterSameOwnerAcquisition);

  const releasedBindingWithOldReservation =
    await inspectStaffWriterReconciliation(
      request,
      makeReaders({
        bindings: {
          status: "observed",
          records: [
            makeCurrentBinding({ ownershipState: "released" })
          ]
        }
      })
    );
  assert.equal(releasedBindingWithOldReservation.status, "incomplete");
  assert.equal(
    releasedBindingWithOldReservation.diagnostic,
    "historical_security_evidence"
  );
  assert.ok(releasedBindingWithOldReservation.missingEvidence.includes(
    "current_binding.released_historical"
  ));
  assertNonAuthorizing(releasedBindingWithOldReservation);

  const releaseReceipt = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: {
        status: "observed",
        records: [
          makeSecurityReceipt({ kind: "binding.released" })
        ]
      },
      bindings: {
        status: "observed",
        records: [makeCurrentBinding({ ownershipState: "released" })]
      }
    })
  );
  assert.equal(releaseReceipt.status, "incomplete");
  assert.ok(releaseReceipt.missingEvidence.includes(
    "security_receipt.binding_released_is_historical"
  ));
  assertNonAuthorizing(releaseReceipt);

  const unknownReceiptKind = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: {
        status: "observed",
        records: [makeSecurityReceipt({ kind: "staff.admin.committed" })]
      }
    })
  );
  assert.equal(unknownReceiptKind.status, "contradictory");
  assert.equal(
    unknownReceiptKind.diagnostic,
    "unsupported_security_receipt_kind"
  );
  assert.ok(unknownReceiptKind.missingEvidence.includes(
    "security_receipt.kind_unsupported"
  ));
  assertNonAuthorizing(unknownReceiptKind);

  const inapplicableReceiptKind =
    await inspectStaffWriterReconciliation(
      {
        ...request,
        mutationCategory: "profile_update",
        bindingIdentity: null
      },
      makeReaders({
        receipts: {
          status: "observed",
          records: [makeSecurityReceipt()]
        }
      })
    );
  assert.equal(inapplicableReceiptKind.status, "contradictory");
  assert.notEqual(inapplicableReceiptKind.status, "consistent");
  assert.ok(inapplicableReceiptKind.missingEvidence.includes(
    "security_receipt.kind_not_applicable_to_mutation"
  ));
  assertNonAuthorizing(inapplicableReceiptKind);

  const enrichedWithoutBindingCorrelation =
    await inspectStaffWriterReconciliation(
      request,
      makeReaders({
        bindings: {
          status: "observed",
          records: [
            makeCurrentBinding({
              operationId: "d20f1c5c-199f-43a1-9241-e36524177d28"
            })
          ]
        }
      })
    );
  assert.notEqual(enrichedWithoutBindingCorrelation.status, "consistent");
  assertNonAuthorizing(enrichedWithoutBindingCorrelation);

  const staleRevision = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: {
        status: "observed",
        records: [makeSecurityReceipt({
          expectedRevision: request.expectedSecurityRevision - 1,
          revision: request.expectedSecurityRevision
        })]
      }
    })
  );
  assert.equal(staleRevision.status, "contradictory");
  assertNonAuthorizing(staleRevision);

  const historicalReceipt = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      bindings: { status: "missing" }
    })
  );
  assert.equal(historicalReceipt.status, "missing");
  assert.ok(historicalReceipt.missingEvidence.includes("current_binding"));
  assertNonAuthorizing(historicalReceipt);

  const sourceFailure = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      receipts: { status: "unavailable" }
    })
  );
  assert.equal(sourceFailure.status, "unavailable");
  assert.deepEqual(sourceFailure.unavailableSources, ["security_receipt"]);
  assert.equal(
    sourceFailure.contractEvaluation.status,
    "uncertain"
  );
  assertNonAuthorizing(sourceFailure);

  const thrownReader = makeReaders();
  const throwingReaders: StaffWriterReconciliationReaders = {
    ...thrownReader,
    async readStaffEvents() {
      throw new Error("simulated lost read acknowledgement");
    }
  };
  const readAcknowledgementLost =
    await inspectStaffWriterReconciliation(request, throwingReaders);
  assert.equal(readAcknowledgementLost.status, "unavailable");
  assert.deepEqual(readAcknowledgementLost.unavailableSources, ["staff_event"]);
  assertNonAuthorizing(readAcknowledgementLost);

  const uncertainReceipt = await inspectStaffWriterReconciliation(
    request,
    makeReaders({ receipts: { status: "uncertain" } })
  );
  assert.equal(uncertainReceipt.status, "uncertain");
  assert.deepEqual(uncertainReceipt.uncertainSources, ["security_receipt"]);
  assertNonAuthorizing(uncertainReceipt);

  const duplicateEvents = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      events: {
        status: "observed",
        records: [makeEvent(), makeEvent()]
      }
    })
  );
  assert.equal(duplicateEvents.status, "contradictory");
  assert.ok(duplicateEvents.missingEvidence.includes(
    "duplicate_or_ambiguous_source_records"
  ));
  assertNonAuthorizing(duplicateEvents);

  const invitationRequest: StaffWriterCoordinationRequest = {
    ...request,
    mutationCategory: "invitation",
    expectedStaffId: "staff-invite-1338",
    expectedStaffState: "absent",
    targetStaffState: "pending"
  };
  const invitation = await inspectStaffWriterReconciliation(
    invitationRequest,
    {
      ...makeReaders({
        receipts: { status: "missing" },
        events: { status: "missing" },
        projections: { status: "missing" },
        invitations: {
          status: "observed",
          records: [{
            operationId: request.operationId,
            outcome: "succeeded"
          }]
        }
      }),
      async readCurrentBinding() {
        return { status: "missing" };
      },
      async readStaffEvents() {
        return { status: "missing" };
      },
      async readStaffProjections() {
        return { status: "missing" };
      }
    }
  );
  assert.equal(invitation.status, "missing");
  assert.equal(invitation.manualReviewRequired, true);
  assert.equal(invitation.contractEvaluation.status, "pending");
  assertNonAuthorizing(invitation);

  let attemptedWrites = 0;
  const readOnlyReaders = makeReaders({
    onRead: () => { attemptedWrites += 1; }
  });
  assert.equal("write" in readOnlyReaders, false);
  await inspectStaffWriterReconciliation(request, readOnlyReaders);
  assert.equal(attemptedWrites, 4);

  const noCurrentProjection = await inspectStaffWriterReconciliation(
    request,
    makeReaders({
      projections: {
        status: "observed",
        records: [makeProjection({ lastEventId: "evt-later" })]
      }
    })
  );
  assert.equal(noCurrentProjection.status, "missing");
  assertNonAuthorizing(noCurrentProjection);

  console.log("Staff writer reconciliation inspection tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
