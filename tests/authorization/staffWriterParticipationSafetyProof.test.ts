import assert from "node:assert/strict";
import type {
  StaffWriterCoordinationEvidence,
  StaffWriterCoordinationRequest,
  StaffWriterMutationCategory
} from "../../src/domain/staff/staffWriterCoordinationContract";
import {
  STAFF_WRITER_PARTICIPATION_HAZARDS,
  assessStaffWriterParticipationSafety,
  type StaffWriterParticipationHazard,
  type StaffWriterParticipationSafetyAssessment
} from "../../src/domain/staff/staffWriterParticipationSafetyProof";

const binding = {
  entraTenantId: "11111111-1111-4111-8111-111111111111",
  entraObjectId: "22222222-2222-4222-8222-222222222222"
};

type Shape = {
  expected: "absent" | "pending" | "active" | "revoked";
  target?: "pending" | "active" | "revoked";
  binding: typeof binding | null;
};

const shapes: Record<StaffWriterMutationCategory, Shape> = {
  profile_update: { expected: "active", binding: null },
  identity_creation: { expected: "absent", target: "active", binding },
  binding_change: { expected: "active", target: "active", binding },
  status_transition: { expected: "active", target: "active", binding: null },
  deactivation: { expected: "active", target: "revoked", binding },
  invitation: { expected: "absent", target: "pending", binding },
  activation: { expected: "pending", target: "active", binding }
};
const categories = Object.keys(shapes) as StaffWriterMutationCategory[];

function request(category: StaffWriterMutationCategory): StaffWriterCoordinationRequest {
  const s = shapes[category];
  return {
    mutationCategory: category,
    operationId: "op-1346-0001",
    eventId: "evt-1346-0001",
    expectedSecurityRevision: 4,
    expectedStaffId: "staff-1346",
    expectedStaffState: s.expected,
    ...(s.target ? { targetStaffState: s.target } : {}),
    bindingIdentity: s.binding
  };
}

function evidence(category: StaffWriterMutationCategory): StaffWriterCoordinationEvidence {
  const r = request(category);
  const refs = {
    operationId: r.operationId,
    eventId: r.eventId,
    staffId: r.expectedStaffId,
    mutationCategory: category,
    bindingIdentity: r.bindingIdentity ?? null
  };
  return {
    securityDecision: {
      state: "committed",
      ...refs,
      expectedRevision: 4,
      revision: 5,
      previousStaffState: r.expectedStaffState,
      resultingStaffState: r.targetStaffState ?? r.expectedStaffState
    },
    staffEventsPersistence: { state: "committed", ...refs },
    projection: { state: "projected", ...refs, securityRevision: 5 },
    invitationSideEffect: category === "invitation" ? "succeeded" : "not_applicable"
  };
}

function assertSafe(a: StaffWriterParticipationSafetyAssessment): void {
  assert.equal(a.authoritative, false);
  assert.equal(a.executionPermitted, false);
  assert.equal(a.retryPermitted, false);
  assert.equal(a.automaticRecoveryPermitted, false);
  assert.equal(a.securityTransactionVerified, false);
  assert.equal(a.crossTableAtomicityVerified, false);
  assert.equal(a.operationIdUniquenessEnforced, false);
  assert.equal(a.coordination.executionPermitted, false);
  assert.equal(a.coordination.retryPermitted, false);
  assert.equal(a.coordination.authoritative, false);
}

function assess(
  category: StaffWriterMutationCategory,
  change: (e: any) => void = () => undefined,
  hazards?: unknown
) {
  const e = evidence(category);
  change(e);
  const a = assessStaffWriterParticipationSafety(
    request(category),
    e,
    hazards as StaffWriterParticipationHazard[] | undefined
  );
  assertSafe(a);
  return a;
}

// Fully consistent evidence is observed only, for every category.
for (const c of categories) {
  const a = assess(c);
  assert.equal(a.coordination.status, "committed", c);
  assert.equal(a.status, "observed_consistent", c);
  assert.deepEqual(a.hazards, []);
  assert.equal(a.inputRejected, false);
  assert.ok(a.diagnostics.some(d => d.includes("no_authorization_or_atomicity")));
}

// Coordination result is passed through unchanged.
{
  const direct = assess("profile_update").coordination;
  assert.deepEqual(direct, assess("profile_update", () => undefined, []).coordination);
}

// Every hazard on complete evidence, for every category.
const expectedFloor: Record<StaffWriterParticipationHazard, string> = {
  security_acknowledgement_lost: "uncertain",
  staff_event_acknowledgement_lost: "uncertain",
  duplicate_operation_observed: "blocked",
  duplicate_event_observed: "blocked",
  binding_ownership_conflict: "blocked",
  external_invitation_succeeded_before_append_failure: "blocked",
  external_invitation_outcome_uncertain: "uncertain",
  staff_event_append_failed: "blocked"
};
for (const c of categories) {
  for (const h of STAFF_WRITER_PARTICIPATION_HAZARDS) {
    const a = assess(c, () => undefined, [h]);
    assert.deepEqual(a.hazards, [h]);
    assert.notEqual(a.status, "observed_consistent", `${c}:${h}`);
    assert.equal(a.reconciliationRequired, true);
    assert.equal(a.manualInterventionRequired, true);
    if (h.startsWith("external_invitation") && c !== "invitation") {
      assert.equal(a.status, "contradictory", `${c}:${h}`);
    } else {
      assert.equal(a.status, expectedFloor[h], `${c}:${h}`);
    }
  }
}

// Mixed hazards: deterministic canonical order, duplicates collapsed.
{
  const a = assess("invitation", () => undefined, [
    "staff_event_append_failed",
    "duplicate_event_observed",
    "security_acknowledgement_lost",
    "duplicate_event_observed"
  ]);
  assert.deepEqual(a.hazards, [
    "security_acknowledgement_lost",
    "duplicate_event_observed",
    "staff_event_append_failed"
  ]);
  assert.equal(a.status, "blocked");
  const b = assess("invitation", () => undefined, [
    "duplicate_event_observed",
    "security_acknowledgement_lost",
    "staff_event_append_failed"
  ]);
  assert.deepEqual(a.diagnostics, b.diagnostics);
  assert.deepEqual(a, b);
}

// Uncertain security and StaffEvents acknowledgements never permit retry.
{
  const sec = assess("profile_update", e => { e.securityDecision = { state: "uncertain" }; });
  assert.equal(sec.status, "uncertain");
  assert.equal(sec.reconciliationRequired, true);
  const ev = assess("profile_update", e => {
    e.staffEventsPersistence = { state: "uncertain" };
  }, ["staff_event_acknowledgement_lost"]);
  assert.equal(ev.status, "uncertain");
  assert.equal(ev.retryPermitted, false);
}

// Rejected security decision stays blocked and never becomes eligible.
{
  const a = assess("profile_update", e => {
    e.securityDecision = { state: "rejected", operationId: "op-1346-0001", eventId: "evt-1346-0001",
      staffId: "staff-1346", mutationCategory: "profile_update", rejectionReason: "stale_revision" };
    e.staffEventsPersistence = { state: "missing" };
    e.projection = { state: "missing" };
  });
  assert.equal(a.coordination.status, "rejected");
  assert.equal(a.status, "blocked");
  assert.equal(a.executionPermitted, false);
}

// Pending evidence stays pending.
assert.equal(
  assess("profile_update", e => { e.securityDecision = { state: "not_required" }; }).status,
  "pending"
);

// Cross-source disagreement remains contradictory and is never downgraded.
{
  const a = assess("profile_update", e => { e.staffEventsPersistence.eventId = "evt-other"; });
  assert.equal(a.coordination.status, "inconsistent");
  assert.equal(a.status, "contradictory");
  assert.equal(a.reconciliationRequired, true);
  assert.equal(a.manualInterventionRequired, true);
  const rev = assess("profile_update", e => { e.projection.securityRevision = 99; });
  assert.notEqual(rev.status, "observed_consistent");
}

// Invitation succeeded externally but persistence missing or rejected.
for (const persistence of [
  { state: "missing" },
  { state: "rejected", operationId: "op-1346-0001", eventId: "evt-1346-0001",
    staffId: "staff-1346", mutationCategory: "invitation", bindingIdentity: binding }
]) {
  const a = assess("invitation", e => {
    e.staffEventsPersistence = persistence;
    e.projection = { state: "missing" };
  }, ["external_invitation_succeeded_before_append_failure", "staff_event_append_failed"]);
  assert.notEqual(a.status, "observed_consistent");
  assert.equal(a.status === "blocked" || a.status === "contradictory", true);
  assert.equal(a.reconciliationRequired, true);
  assert.equal(a.manualInterventionRequired, true);
  assert.equal(a.retryPermitted, false);
}

// Uncertain invitation outcome never permits another invitation.
{
  const a = assess("invitation", e => { e.invitationSideEffect = "uncertain"; },
    ["external_invitation_outcome_uncertain"]);
  assert.equal(a.status, "uncertain");
  assert.equal(a.retryPermitted, false);
  assert.equal(a.automaticRecoveryPermitted, false);
}

// Wrapper never downgrades coordination flags.
for (const c of categories) {
  const a = assess(c, e => { e.projection.state = "inconsistent"; }, []);
  assert.equal(a.reconciliationRequired, a.coordination.reconciliationRequired || false);
  assert.equal(a.reconciliationRequired, true);
}

// Malformed runtime input fails closed and never throws.
const malformed: unknown[] = [
  "duplicate_event_observed", null, 7, {}, ["unknown_hazard"], [null],
  [1], ["duplicate_event_observed", "bogus"]
];
for (const h of malformed) {
  const a = assess("profile_update", () => undefined, h);
  assert.equal(a.inputRejected, true);
  assert.equal(a.status, "contradictory");
  assert.deepEqual(a.hazards, []);
  assert.equal(a.reconciliationRequired, true);
  assert.equal(a.manualInterventionRequired, true);
}
for (const [req, ev] of [
  [null, null], [undefined, undefined], [{}, {}],
  [request("profile_update"), null], [{ mutationCategory: 5 }, evidence("profile_update")]
] as const) {
  const a = assessStaffWriterParticipationSafety(req as never, ev as never, []);
  assertSafe(a);
  assert.notEqual(a.status, "observed_consistent");
}
{
  // A throwing evaluator input (hostile getter) still fails closed.
  const hostile = new Proxy({}, { get() { throw new Error("boom"); } });
  const a = assessStaffWriterParticipationSafety(hostile as never, hostile as never);
  assertSafe(a);
  assert.equal(a.status, "contradictory");
  assert.equal(a.inputRejected, true);
}

// Hostile hazard collections fail closed without throwing.
{
  const throwingIterator: unknown[] = ["duplicate_operation_observed"];
  (throwingIterator as any)[Symbol.iterator] = () => {
    throw new Error("iterator-secret");
  };
  const inspectionThrows = new Proxy([], {
    getPrototypeOf() { throw new Error("inspect-secret"); },
    has() { throw new Error("inspect-secret"); },
    ownKeys() { throw new Error("inspect-secret"); },
    get() { throw new Error("inspect-secret"); }
  });
  const indexedThrows = new Proxy(["duplicate_operation_observed"], {
    get(target, prop, receiver) {
      if (typeof prop === "string" && /^\d+$/.test(prop)) {
        throw new Error("index-secret");
      }
      return Reflect.get(target, prop, receiver);
    }
  });
  for (const hostile of [indexedThrows, throwingIterator, inspectionThrows]) {
    const a = assess("profile_update", undefined, hostile);
    assert.equal(a.status, "contradictory");
    assert.equal(a.inputRejected, true);
    assert.deepEqual(a.hazards, []);
    assert.equal(a.reconciliationRequired, true);
    assert.equal(a.manualInterventionRequired, true);
    assert.ok(a.diagnostics.includes("hazard_input_invalid_fail_closed"));
    assert.ok(!JSON.stringify(a.diagnostics).includes("secret"));
    assert.ok(a.diagnostics.every(d => /^[a-z_:]+$/.test(d)));
  }
}

// Diagnostics contain only fixed codes, never request or evidence values.
{
  const a = assess("invitation", e => {
    e.securityDecision.operationId = "secret-token-value";
  }, ["duplicate_operation_observed"]);
  assert.ok(!JSON.stringify(a.diagnostics).includes("secret-token-value"));
  assert.ok(a.diagnostics.every(d => /^[a-z_:]+$/.test(d)));
}

console.log("Staff writer participation safety proof tests passed");
