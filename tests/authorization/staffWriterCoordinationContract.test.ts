import assert from "node:assert/strict";
import {
  evaluateStaffWriterCoordination,
  type StaffSecurityDecisionEvidence,
  type StaffWriterCoordinationEvidence,
  type StaffWriterCoordinationRequest,
  type StaffWriterMutationCategory,
  type StaffWriterPathway
} from "../../src/domain/staff/staffWriterCoordinationContract";

const binding = {
  entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
  entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
};

type Scenario = {
  category: StaffWriterMutationCategory;
  pathway: StaffWriterPathway;
  expectedStaffState: "absent" | "pending" | "active" | "revoked";
  targetStaffState?: "absent" | "pending" | "active" | "revoked";
  bindingIdentity?: typeof binding | null;
};

function scenario(
  category: StaffWriterMutationCategory
): Scenario {
  switch (category) {
    case "profile_update":
      return {
        category,
        pathway: "identity_update",
        expectedStaffState: "active",
        bindingIdentity: null
      };
    case "identity_creation":
      return {
        category,
        pathway: "identity_creation",
        expectedStaffState: "absent",
        targetStaffState: "active",
        bindingIdentity: binding
      };
    case "binding_change":
      return {
        category,
        pathway: "identity_update",
        expectedStaffState: "active",
        targetStaffState: "active",
        bindingIdentity: binding
      };
    case "status_transition":
      return {
        category,
        pathway: "identity_update",
        expectedStaffState: "active",
        targetStaffState: "active",
        bindingIdentity: null
      };
    case "deactivation":
      return {
        category,
        pathway: "identity_update",
        expectedStaffState: "active",
        targetStaffState: "revoked",
        bindingIdentity: binding
      };
    case "invitation":
      return {
        category,
        pathway: "invitation_creation",
        expectedStaffState: "absent",
        targetStaffState: "pending",
        bindingIdentity: binding
      };
    case "activation":
      return {
        category,
        pathway: "invitation_activation",
        expectedStaffState: "pending",
        targetStaffState: "active",
        bindingIdentity: binding
      };
  }
}

function makeRequest(
  value: Scenario
): StaffWriterCoordinationRequest {
  return {
    mutationCategory: value.category,
    operationId: "op-1337-0001",
    eventId: "evt-1337-0001",
    expectedSecurityRevision: 12,
    expectedStaffId: "staff-1337",
    expectedStaffState: value.expectedStaffState,
    ...(value.targetStaffState
      ? { targetStaffState: value.targetStaffState }
      : {}),
    bindingIdentity: value.bindingIdentity ?? null
  };
}

function makeEvidence(
  value: Scenario
): StaffWriterCoordinationEvidence {
  const request = makeRequest(value);
  const securityDecision: StaffSecurityDecisionEvidence =
    {
      state: "committed",
      operationId: request.operationId,
      eventId: request.eventId,
      staffId: request.expectedStaffId,
      mutationCategory: value.category,
      expectedRevision: request.expectedSecurityRevision,
      revision: request.expectedSecurityRevision + 1,
      previousStaffState: request.expectedStaffState,
      resultingStaffState:
        value.targetStaffState ?? value.expectedStaffState,
      bindingIdentity: request.bindingIdentity ?? null
    };
  const crossReferences = {
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    mutationCategory: value.category,
    bindingIdentity: request.bindingIdentity ?? null
  };

  return {
    securityDecision,
    staffEventsPersistence: {
      state: "committed",
      ...crossReferences
    },
    projection: {
      state: "projected",
      ...crossReferences,
      securityRevision: request.expectedSecurityRevision + 1
    },
    invitationSideEffect:
      value.category === "invitation"
        ? "succeeded"
        : "not_applicable"
  };
}

function assertNonAuthorizing(
  result: ReturnType<typeof evaluateStaffWriterCoordination>
): void {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.authoritative, false);
}

function evaluate(
  value: Scenario,
  evidence = makeEvidence(value),
  request = makeRequest(value)
): ReturnType<typeof evaluateStaffWriterCoordination> {
  const result = evaluateStaffWriterCoordination(request, evidence);
  assertNonAuthorizing(result);
  return result;
}

const scenarios: Scenario[] = [
  scenario("profile_update"),
  scenario("identity_creation"),
  scenario("binding_change"),
  scenario("status_transition"),
  scenario("deactivation"),
  scenario("invitation"),
  scenario("activation")
];

for (const value of scenarios) {
  const complete = evaluate(value);
  assert.equal(complete.status, "committed");
  assert.equal(complete.pathway, value.pathway);
  assert.equal(complete.reconciliationRequired, false);
  assert.equal(complete.manualInterventionRequired, false);
}

const profileUpdate = scenario("profile_update");
const profileUpdateRequest = makeRequest(profileUpdate);
const profileUpdateEvidence = makeEvidence(profileUpdate);

const profileNotRequired = {
  ...profileUpdateEvidence,
  securityDecision: { state: "not_required" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(profileUpdate, profileNotRequired).status,
  "pending"
);

const profileSecurityMissing = {
  ...profileUpdateEvidence,
  securityDecision: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(profileUpdate, profileSecurityMissing).status,
  "pending"
);

const profileSecurityRejected = {
  ...profileUpdateEvidence,
  securityDecision: {
    state: "rejected",
    operationId: profileUpdateRequest.operationId,
    eventId: profileUpdateRequest.eventId,
    staffId: profileUpdateRequest.expectedStaffId,
    mutationCategory: profileUpdate.category,
    expectedRevision: profileUpdateRequest.expectedSecurityRevision,
    rejectionReason: "storage_rejected"
  },
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(profileUpdate, profileSecurityRejected).status,
  "rejected"
);

const baseScenario = scenario("binding_change");
const baseRequest = makeRequest(baseScenario);
const completeEvidence = makeEvidence(baseScenario);

const missingSecurity = {
  ...completeEvidence,
  securityDecision: {
    state: "missing"
  }
} as StaffWriterCoordinationEvidence;
const eventOnly = evaluate(baseScenario, missingSecurity);
assert.equal(eventOnly.status, "pending");
assert.equal(eventOnly.reconciliationRequired, true);
assert.equal(eventOnly.manualInterventionRequired, true);

const securityBeforeEvent = {
  ...completeEvidence,
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, securityBeforeEvent).status,
  "pending"
);

const eventBeforeSecurity = {
  ...completeEvidence,
  securityDecision: { state: "pending" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, eventBeforeSecurity).status,
  "pending"
);
assert.equal(
  evaluate(
    baseScenario,
    {
      ...completeEvidence,
      securityDecision: { state: "missing" }
    } as StaffWriterCoordinationEvidence
  ).authoritative,
  false
);

const missingEvent = {
  ...completeEvidence,
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(evaluate(baseScenario, missingEvent).status, "pending");

const securityRejected = {
  ...completeEvidence,
  securityDecision: {
    state: "rejected",
    operationId: baseRequest.operationId,
    eventId: baseRequest.eventId,
    staffId: baseRequest.expectedStaffId,
    mutationCategory: baseScenario.category,
    expectedRevision: baseRequest.expectedSecurityRevision,
    bindingIdentity: binding,
    rejectionReason: "binding_conflict"
  },
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, securityRejected).status,
  "rejected"
);

const eventWithoutSecurityCommit = {
  ...securityRejected,
  securityDecision: { state: "rejected" },
  staffEventsPersistence: {
    state: "committed",
    operationId: baseRequest.operationId,
    eventId: baseRequest.eventId,
    staffId: baseRequest.expectedStaffId,
    mutationCategory: baseScenario.category,
    bindingIdentity: binding
  },
  projection: {
    state: "projected",
    operationId: baseRequest.operationId,
    eventId: baseRequest.eventId,
    staffId: baseRequest.expectedStaffId,
    mutationCategory: baseScenario.category,
    bindingIdentity: binding
  }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, eventWithoutSecurityCommit).status,
  "inconsistent"
);

for (const evidence of [
  {
    ...completeEvidence,
    securityDecision: { state: "uncertain" }
  },
  {
    ...completeEvidence,
    staffEventsPersistence: { state: "uncertain" }
  },
  {
    ...completeEvidence,
    projection: { state: "uncertain" }
  }
] as StaffWriterCoordinationEvidence[]) {
  const outcome = evaluate(baseScenario, evidence);
  assert.equal(outcome.status, "uncertain");
  assert.equal(outcome.reconciliationRequired, true);
  assert.equal(outcome.manualInterventionRequired, true);
}

const duplicateOperation = {
  ...completeEvidence,
  staffEventsPersistence: {
    ...completeEvidence.staffEventsPersistence,
    operationId: "op-duplicate"
  }
};
assert.equal(
  evaluate(baseScenario, duplicateOperation).status,
  "inconsistent"
);

const duplicateEvent = {
  ...completeEvidence,
  projection: {
    ...completeEvidence.projection,
    eventId: "evt-duplicate"
  }
};
assert.equal(
  evaluate(baseScenario, duplicateEvent).status,
  "inconsistent"
);

const wrongStaff = {
  ...completeEvidence,
  securityDecision: {
    ...completeEvidence.securityDecision,
    staffId: "staff-other"
  }
};
assert.equal(evaluate(baseScenario, wrongStaff).status, "inconsistent");

const wrongBinding = {
  ...completeEvidence,
  projection: {
    ...completeEvidence.projection,
    bindingIdentity: {
      entraTenantId: binding.entraTenantId,
      entraObjectId: "94e4b1d5-3398-4a6b-a1a8-2466d4aa3d57"
    }
  }
};
assert.equal(
  evaluate(baseScenario, wrongBinding).status,
  "inconsistent"
);

const wrongRevision = {
  ...completeEvidence,
  securityDecision: {
    ...completeEvidence.securityDecision,
    revision: baseRequest.expectedSecurityRevision + 2
  }
};
assert.equal(
  evaluate(baseScenario, wrongRevision).status,
  "inconsistent"
);

const wrongExpectedRevision = {
  ...completeEvidence,
  securityDecision: {
    ...completeEvidence.securityDecision,
    expectedRevision: baseRequest.expectedSecurityRevision - 1
  }
};
assert.equal(
  evaluate(baseScenario, wrongExpectedRevision).status,
  "inconsistent"
);

const wrongOperationInSecurity = {
  ...completeEvidence,
  securityDecision: {
    ...completeEvidence.securityDecision,
    operationId: "op-other"
  }
};
assert.equal(
  evaluate(baseScenario, wrongOperationInSecurity).status,
  "inconsistent"
);

const unexpectedCategory = evaluate(
  baseScenario,
  completeEvidence,
  {
    ...baseRequest,
    mutationCategory: "unrecognized_mutation"
  } as StaffWriterCoordinationRequest
);
assert.equal(unexpectedCategory.status, "rejected");
assert.equal(unexpectedCategory.reason, "unsupported_mutation_category");

const revocationConflict = {
  ...completeEvidence,
  securityDecision: {
    state: "rejected",
    operationId: baseRequest.operationId,
    eventId: baseRequest.eventId,
    staffId: baseRequest.expectedStaffId,
    mutationCategory: baseScenario.category,
    expectedRevision: baseRequest.expectedSecurityRevision,
    bindingIdentity: binding,
    rejectionReason: "revocation_conflict"
  },
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, revocationConflict).status,
  "rejected"
);

const staleRevisionRejection = {
  ...securityRejected,
  securityDecision: {
    ...securityRejected.securityDecision,
    rejectionReason: "stale_revision"
  }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, staleRevisionRejection).status,
  "rejected"
);

const duplicateOperationRejection = {
  ...securityRejected,
  securityDecision: {
    ...securityRejected.securityDecision,
    rejectionReason: "duplicate_operation"
  }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, duplicateOperationRejection).status,
  "rejected"
);

const activationScenario = scenario("activation");
const activationRequest = makeRequest(activationScenario);
const activationEvidence = makeEvidence(activationScenario);
const activationRevocationRace = {
  ...activationEvidence,
  securityDecision: {
    state: "committed",
    operationId: activationRequest.operationId,
    eventId: activationRequest.eventId,
    staffId: activationRequest.expectedStaffId,
    mutationCategory: activationScenario.category,
    expectedRevision: activationRequest.expectedSecurityRevision,
    revision: activationRequest.expectedSecurityRevision + 1,
    previousStaffState: "revoked",
    resultingStaffState: "active",
    bindingIdentity: binding
  }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(
    activationScenario,
    activationRevocationRace
  ).status,
  "inconsistent"
);

const invitationScenario = scenario("invitation");
const invitationRequest = makeRequest(invitationScenario);
const invitationGraphOnly = {
  securityDecision: { state: "missing" },
  staffEventsPersistence: { state: "missing" },
  projection: { state: "missing" },
  invitationSideEffect: "succeeded"
} as StaffWriterCoordinationEvidence;
const graphWithoutLocalCommit = evaluate(
  invitationScenario,
  invitationGraphOnly
);
assert.equal(graphWithoutLocalCommit.status, "pending");
assert.equal(graphWithoutLocalCommit.manualInterventionRequired, true);
assert.equal(graphWithoutLocalCommit.authoritative, false);
assert.ok(invitationRequest.operationId);

const invitationGraphUnknown = {
  ...invitationGraphOnly,
  invitationSideEffect: "uncertain"
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(invitationScenario, invitationGraphUnknown).status,
  "uncertain"
);

const invitationGraphSucceededLocalFailure = {
  ...makeEvidence(invitationScenario),
  securityDecision: { state: "missing" },
  staffEventsPersistence: {
    state: "rejected",
    operationId: invitationRequest.operationId,
    eventId: invitationRequest.eventId,
    staffId: invitationRequest.expectedStaffId,
    mutationCategory: invitationScenario.category,
    bindingIdentity: binding
  },
  projection: { state: "missing" }
} as StaffWriterCoordinationEvidence;
const externalOnly = evaluate(
  invitationScenario,
  invitationGraphSucceededLocalFailure
);
assert.equal(externalOnly.status, "pending");
assert.equal(externalOnly.manualInterventionRequired, true);

const invalidBinding = {
  ...makeRequest(scenario("activation")),
  bindingIdentity: {
    entraTenantId: "not-a-guid",
    entraObjectId: binding.entraObjectId
  }
} as unknown as StaffWriterCoordinationRequest;
assert.equal(
  evaluateStaffWriterCoordination(
    invalidBinding,
    makeEvidence(activationScenario)
  ).status,
  "inconsistent"
);

const missingCommittedReferences = {
  ...completeEvidence,
  staffEventsPersistence: { state: "committed" }
} as StaffWriterCoordinationEvidence;
assert.equal(
  evaluate(baseScenario, missingCommittedReferences).status,
  "inconsistent"
);

const explicitIncompleteRows: Array<
  [string, StaffWriterCoordinationEvidence]
> = [
  [
    "security commit without projection",
    {
      ...completeEvidence,
      projection: { state: "missing" }
    } as StaffWriterCoordinationEvidence
  ],
  [
    "projection without persisted event",
    {
      ...completeEvidence,
      staffEventsPersistence: { state: "missing" }
    } as StaffWriterCoordinationEvidence
  ],
  [
    "committed security with failed event write",
    {
      ...completeEvidence,
      staffEventsPersistence: {
        state: "rejected",
        operationId: baseRequest.operationId,
        eventId: baseRequest.eventId,
        staffId: baseRequest.expectedStaffId,
        mutationCategory: baseScenario.category,
        bindingIdentity: binding
      },
      projection: { state: "missing" }
    } as StaffWriterCoordinationEvidence
  ]
];
for (const [description, evidence] of explicitIncompleteRows) {
  const outcome = evaluate(baseScenario, evidence);
  assert.equal(outcome.status, "pending", description);
  assert.equal(outcome.reconciliationRequired, true);
}

console.log("Staff writer coordination contract tests passed");
