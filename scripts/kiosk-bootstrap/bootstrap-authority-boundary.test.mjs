import test from "node:test";
import assert from "node:assert/strict";

import {
  assessBootstrapAuthority
} from "./bootstrap-authority-boundary.mjs";

import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

const request = () => ({
  operationId: "synthetic_operation_001",
  target: { ...KIOSK_BOOTSTRAP_TARGET }
});

const evidence = () => ({
  verified: true,
  purpose: "FIRST_CANONICAL_STAFF_BOOTSTRAP",
  operationId: "synthetic_operation_001",
  target: { ...KIOSK_BOOTSTRAP_TARGET },
  approvalReference: "synthetic_approval_001",
  actorProvenanceVerified: true,
  ownerIdentityVerified: true
});

function denied(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.automaticRetryPermitted, false);
  assert.equal(result.productionWriterFenced, false);
}

test("missing verifier denies", async () => {
  const result = await assessBootstrapAuthority(request());
  denied(result);
  assert.equal(result.status, "INDEPENDENT_VERIFIER_UNAVAILABLE");
});

test("wrong environment never calls verifier", async () => {
  let calls = 0;
  const input = request();
  input.target.functionApp = "wrong-app";

  const result = await assessBootstrapAuthority(input, {
    async verify() { calls++; return evidence(); }
  });

  denied(result);
  assert.equal(calls, 0);
});

test("invalid operation never calls verifier", async () => {
  let calls = 0;
  const input = request();
  input.operationId = "../invalid";

  const result = await assessBootstrapAuthority(input, {
    async verify() { calls++; return evidence(); }
  });

  denied(result);
  assert.equal(calls, 0);
});

test("caller approval flags are not accepted", async () => {
  const result = await assessBootstrapAuthority({
    ...request(),
    ownerApproved: true,
    force: true
  });

  denied(result);
  assert.equal(result.status, "INDEPENDENT_VERIFIER_UNAVAILABLE");
});

test("verifier failure denies", async () => {
  const result = await assessBootstrapAuthority(request(), {
    async verify() { throw Error("synthetic failure"); }
  });

  denied(result);
  assert.equal(result.status, "VERIFICATION_FAILED_CLOSED");
});

test("unverified provenance denies", async () => {
  const result = await assessBootstrapAuthority(request(), {
    async verify() {
      return { ...evidence(), actorProvenanceVerified: false };
    }
  });

  denied(result);
  assert.equal(result.status, "APPROVAL_EVIDENCE_NOT_VERIFIED");
});

test("wrong approval operation denies", async () => {
  const result = await assessBootstrapAuthority(request(), {
    async verify() {
      return { ...evidence(), operationId: "different_operation" };
    }
  });

  denied(result);
  assert.equal(result.status, "APPROVAL_EVIDENCE_NOT_VERIFIED");
});

test("even matching verifier evidence denies execution", async () => {
  let calls = 0;

  const result = await assessBootstrapAuthority(request(), {
    async verify(input) {
      calls++;
      assert.equal(
        input.purpose,
        "FIRST_CANONICAL_STAFF_BOOTSTRAP"
      );
      return evidence();
    }
  });

  denied(result);
  assert.equal(calls, 1);
  assert.equal(result.status, "VERIFIED_EVIDENCE_DESIGN_ONLY");
  assert.equal(result.approvalReference, "synthetic_approval_001");
});

test("verifier approval cannot invoke Staff writer", async () => {
  let writes = 0;

  const result = await assessBootstrapAuthority(request(), {
    async verify() { return evidence(); },
    async createStaff() { writes++; },
    async createEntity() { writes++; }
  });

  denied(result);
  assert.equal(writes, 0);
});