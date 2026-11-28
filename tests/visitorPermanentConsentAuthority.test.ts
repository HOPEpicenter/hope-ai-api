import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  initializeConsentAuthority,
  isConsentAuthority,
  permitsContactWork,
  transitionConsentAuthority,
  type ConsentAuthority,
  type ConsentTransition
} from "../src/domain/followups/permanentVisitorConsentAuthority";

function initial(granted: boolean): ConsentAuthority {
  const result = initializeConsentAuthority({
    kind: "new_profile",
    evidenceId: "synthetic-initial",
    initialConsent: granted
  });
  assert.ok(result);
  return result;
}

function existing(): ConsentAuthority {
  const result = initializeConsentAuthority({
    kind: "existing_profile",
    evidenceId: "synthetic-existing"
  });
  assert.ok(result);
  return result;
}

function publicRequest(
  state: ConsentAuthority,
  requestedConsent: boolean,
  requestId = "synthetic-request"
): ConsentTransition {
  return transitionConsentAuthority(state, {
    kind: "public_request",
    expectedRevision: state.revision,
    requestId,
    requestedConsent
  });
}

function staffDecision(
  state: ConsentAuthority,
  decision: "granted" | "declined",
  pendingRequestId = "synthetic-request"
): ConsentTransition {
  return transitionConsentAuthority(state, {
    kind: "verified_staff_decision",
    expectedRevision: state.revision,
    pendingRequestId,
    decision,
    actorId: "synthetic-staff",
    decisionId: "synthetic-decision"
  });
}

function applied(
  result: ConsentTransition
): ConsentAuthority {
  assert.equal(result.status, "applied");

  if (result.status !== "applied") {
    throw new Error("Expected applied transition");
  }

  assert.equal(isConsentAuthority(result.state), true);
  return result.state;
}

test("new visitor grant permits consent eligibility", () => {
  assert.equal(permitsContactWork(initial(true)), true);
});

test("new visitor decline blocks contact work", () => {
  assert.equal(permitsContactWork(initial(false)), false);
});

test("existing visitor initializes without permission", () => {
  const state = existing();
  assert.equal(state.effective, "unknown");
  assert.equal(permitsContactWork(state), false);
});

test("existing profile cannot bootstrap a public grant", () => {
  assert.equal(initializeConsentAuthority({
    kind: "existing_profile",
    evidenceId: "synthetic-existing",
    initialConsent: true
  }), null);
});

test("public Yes preserves existing grant and revision", () => {
  const state = initial(true);
  assert.deepEqual(publicRequest(state, true), {
    status: "unchanged", state
  });
});

test("public No suppresses without authoritative decline", () => {
  const state = applied(publicRequest(initial(true), false));
  assert.equal(state.effective, "granted");
  assert.equal(state.pending?.kind, "withdrawal");
  assert.equal(state.revision, 2);
  assert.equal(permitsContactWork(state), false);
});

test("public Yes cannot remove pending withdrawal", () => {
  const state = applied(publicRequest(initial(true), false));
  assert.deepEqual(publicRequest(
    state, true, "synthetic-later"
  ), { status: "unchanged", state });
  assert.equal(permitsContactWork(state), false);
});

test("repeated withdrawal preserves original request", () => {
  const state = applied(publicRequest(initial(true), false));
  assert.deepEqual(publicRequest(
    state, false, "synthetic-later"
  ), { status: "unchanged", state });
});

test("declined visitor public Yes requires verification", () => {
  const state = applied(publicRequest(initial(false), true));
  assert.equal(state.effective, "declined");
  assert.equal(state.pending?.kind, "grant");
  assert.equal(permitsContactWork(state), false);
});

test("unknown visitor public Yes cannot grant authority", () => {
  const state = applied(publicRequest(existing(), true));
  assert.equal(state.effective, "unknown");
  assert.equal(state.pending?.kind, "grant");
  assert.equal(permitsContactWork(state), false);
});

test("withdrawal supersedes pending grant conservatively", () => {
  const pending = applied(publicRequest(existing(), true));
  const state = applied(publicRequest(
    pending, false, "synthetic-withdrawal"
  ));
  assert.equal(state.pending?.kind, "withdrawal");
  assert.equal(permitsContactWork(state), false);
});

test("verified Staff decision can record decline", () => {
  const pending = applied(publicRequest(initial(true), false));
  const state = applied(staffDecision(pending, "declined"));
  assert.equal(state.effective, "declined");
  assert.equal(state.pending, null);
  assert.equal(permitsContactWork(state), false);
});

test("verified Staff decision can resolve pending permission", () => {
  const pending = applied(publicRequest(initial(false), true));
  const state = applied(staffDecision(pending, "granted"));
  assert.equal(state.effective, "granted");
  assert.equal(state.pending, null);
  assert.equal(permitsContactWork(state), true);
});

test("wrong pending request cannot restore contact permission", () => {
  const pending = applied(publicRequest(initial(true), false));
  assert.deepEqual(
    staffDecision(pending, "granted", "synthetic-wrong"),
    { status: "rejected", reason: "pending_request_mismatch" }
  );
});

test("stale revision cannot release newer withdrawal", () => {
  const pending = applied(publicRequest(existing(), true));
  const state = applied(publicRequest(
    pending, false, "synthetic-withdrawal"
  ));
  assert.deepEqual(transitionConsentAuthority(state, {
    kind: "verified_staff_decision",
    expectedRevision: pending.revision,
    pendingRequestId: pending.pending?.requestId,
    decision: "granted",
    actorId: "synthetic-staff",
    decisionId: "synthetic-old-decision"
  }), { status: "rejected", reason: "stale_revision" });
  assert.equal(permitsContactWork(state), false);
});

test("public request cannot inject Staff authority fields", () => {
  assert.deepEqual(transitionConsentAuthority(initial(false), {
    kind: "public_request",
    expectedRevision: 1,
    requestId: "synthetic-request",
    requestedConsent: true,
    actorId: "synthetic-staff"
  }), { status: "rejected", reason: "invalid_command" });
});

test("malformed and unknown authority states fail closed", () => {
  for (const state of [
    null, undefined, {},
    { ...initial(true), version: 2 },
    { ...initial(true), revision: 0 },
    { ...initial(true), effective: "invalid" },
    { ...initial(true), unexpected: true },
    {
      ...initial(true),
      pending: {
        kind: "grant",
        requestId: "synthetic-request"
      }
    }
  ]) {
    assert.equal(permitsContactWork(state), false);
    assert.deepEqual(
      transitionConsentAuthority(state, {}),
      { status: "rejected", reason: "invalid_state" }
    );
  }
});

test("revision overflow fails closed without changing state", () => {
  const state = {
    ...initial(true),
    revision: Number.MAX_SAFE_INTEGER
  };
  assert.deepEqual(publicRequest(state, false), {
    status: "rejected",
    reason: "revision_exhausted"
  });
});

test("Staff decision requires an exact pending request", () => {
  assert.deepEqual(staffDecision(initial(false), "granted"), {
    status: "rejected",
    reason: "pending_request_mismatch"
  });
});

test("transition does not mutate original authority state", () => {
  const state = Object.freeze(initial(true));
  const next = applied(publicRequest(state, false));
  assert.equal(state.pending, null);
  assert.equal(state.revision, 1);
  assert.equal(next.revision, 2);
});

function historicalDecision(
  state: ConsentAuthority,
  decision: "granted" | "declined",
  expectedRevision = state.revision
): ConsentTransition {
  return transitionConsentAuthority(state, {
    kind: "verified_staff_decision",
    expectedRevision,
    decisionId: "synthetic-historical-decision",
    pendingRequestId: null,
    actorId: "synthetic-authorized-admin",
    decision
  });
}

test("historical unknown consent permits explicitly verified Staff grant", () => {
  const state = applied(historicalDecision(existing(), "granted"));
  assert.equal(state.effective, "granted");
  assert.equal(state.revision, 2);
  assert.equal(state.pending, null);
  assert.equal(permitsContactWork(state), true);
});

test("historical verified decline never permits contact work", () => {
  const state = applied(historicalDecision(existing(), "declined"));
  assert.equal(state.effective, "declined");
  assert.equal(permitsContactWork(state), false);
});

test("direct historical decision cannot overwrite established consent", () => {
  for (const state of [initial(true), initial(false)]) {
    assert.equal(
      historicalDecision(state, "granted").status,
      "rejected"
    );
  }
});

test("direct historical grant cannot bypass pending withdrawal or grant", () => {
  for (const choice of [true, false]) {
    const pending = applied(publicRequest(existing(), choice));

    assert.equal(
      historicalDecision(pending, "granted").status,
      "rejected"
    );

    assert.equal(permitsContactWork(pending), false);
  }
});

test("historical verification rejects stale revision and missing actor", () => {
  const state = existing();

  assert.equal(
    historicalDecision(state, "granted", 2).status,
    "rejected"
  );

  assert.equal(transitionConsentAuthority(state, {
    kind: "verified_staff_decision",
    expectedRevision: 1,
    decisionId: "synthetic-invalid",
    pendingRequestId: null,
    actorId: "",
    decision: "granted"
  }).status, "rejected");
});
