import assert from "node:assert/strict";
import {
  assessStaffActivationAtomicityReadiness,
  STAFF_ACTIVATION_ATOMICITY_GAPS
} from "../../src/domain/staff/staffActivationAtomicityReadiness";
import type {
  StaffWriterCoordinationEvidence,
  StaffWriterCoordinationRequest
} from "../../src/domain/staff/staffWriterCoordinationContract";

const binding = {
  entraTenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  entraObjectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
};

const request: StaffWriterCoordinationRequest = {
  mutationCategory: "activation",
  operationId: "synthetic-operation-1",
  eventId: "synthetic-event-1",
  expectedSecurityRevision: 3,
  expectedStaffId: "synthetic-staff-1",
  expectedStaffState: "pending",
  targetStaffState: "active",
  bindingIdentity: binding
};

function evidence(): StaffWriterCoordinationEvidence {
  const identity = {
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    mutationCategory: "activation",
    bindingIdentity: binding
  };

  return {
    securityDecision: {
      ...identity,
      state: "committed",
      expectedRevision: 3,
      revision: 4,
      previousStaffState: "pending",
      resultingStaffState: "active"
    },
    staffEventsPersistence: {
      ...identity,
      state: "committed"
    },
    projection: {
      ...identity,
      state: "projected",
      securityRevision: 4
    },
    invitationSideEffect: "not_applicable"
  };
}

function assertNoAuthority(
  value: ReturnType<typeof assessStaffActivationAtomicityReadiness>
): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.activationPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
  assert.equal(value.securityTransactionVerified, false);
  assert.equal(value.crossTableAtomicityVerified, false);
  assert.equal(value.allWritersCoordinated, false);
  assert.deepEqual(value.gaps, [...STAFF_ACTIVATION_ATOMICITY_GAPS]);
}

function run(): void {
  const complete = assessStaffActivationAtomicityReadiness(
    request,
    evidence()
  );

  assert.equal(complete.participation.coordination.status, "committed");
  assert.equal(complete.status, "incomplete");
  assertNoAuthority(complete);

  const pendingBase = evidence();
  const pendingEvidence: StaffWriterCoordinationEvidence = {
    ...pendingBase,
    staffEventsPersistence: {
      ...pendingBase.staffEventsPersistence,
      state: "missing"
    }
  };

  const pending = assessStaffActivationAtomicityReadiness(
    request,
    pendingEvidence
  );

  assert.equal(pending.status, "incomplete");
  assert.equal(pending.reconciliationRequired, true);
  assertNoAuthority(pending);

  const uncertainBase = evidence();
  const uncertainEvidence: StaffWriterCoordinationEvidence = {
    ...uncertainBase,
    securityDecision: {
      ...uncertainBase.securityDecision,
      state: "uncertain"
    }
  };

  const uncertain = assessStaffActivationAtomicityReadiness(
    request,
    uncertainEvidence
  );

  assert.equal(uncertain.status, "uncertain");
  assert.equal(uncertain.reconciliationRequired, true);
  assert.equal(uncertain.manualInterventionRequired, true);
  assertNoAuthority(uncertain);

  const conflictingBase = evidence();
  const conflictingEvidence: StaffWriterCoordinationEvidence = {
    ...conflictingBase,
    securityDecision: {
      ...conflictingBase.securityDecision,
      state: "rejected",
      rejectionReason: "stale_revision"
    }
  };

  const contradictory = assessStaffActivationAtomicityReadiness(
    request,
    conflictingEvidence
  );

  assert.equal(contradictory.status, "contradictory");
  assertNoAuthority(contradictory);

  const rejectedBase = evidence();
  const rejectedEvidence: StaffWriterCoordinationEvidence = {
    ...rejectedBase,
    securityDecision: {
      ...rejectedBase.securityDecision,
      state: "rejected"
    },
    staffEventsPersistence: {
      ...rejectedBase.staffEventsPersistence,
      state: "missing"
    },
    projection: {
      ...rejectedBase.projection,
      state: "missing"
    }
  };

  const rejected = assessStaffActivationAtomicityReadiness(
    request,
    rejectedEvidence
  );

  assert.equal(rejected.status, "blocked");
  assertNoAuthority(rejected);

  const notActivation = assessStaffActivationAtomicityReadiness(
    {
      ...request,
      mutationCategory: "deactivation",
      expectedStaffState: "active",
      targetStaffState: "revoked"
    },
    evidence()
  );

  assert.equal(notActivation.status, "contradictory");
  assertNoAuthority(notActivation);

  const hostile = new Proxy({}, {
    get() {
      throw new Error("hostile getter");
    }
  });

  const hostileResult = assessStaffActivationAtomicityReadiness(
    hostile as StaffWriterCoordinationRequest,
    evidence()
  );

  assert.equal(hostileResult.status, "contradictory");
  assertNoAuthority(hostileResult);

  const invalidHazards = assessStaffActivationAtomicityReadiness(
    request,
    evidence(),
    ["unknown_hazard"] as any
  );

  assert.equal(invalidHazards.status, "contradictory");
  assertNoAuthority(invalidHazards);

  const lostAcknowledgement = assessStaffActivationAtomicityReadiness(
    request,
    evidence(),
    ["security_acknowledgement_lost"]
  );

  assert.equal(lostAcknowledgement.status, "uncertain");
  assertNoAuthority(lostAcknowledgement);

  console.log("staffActivationAtomicityReadiness.test.ts passed");
}

run();