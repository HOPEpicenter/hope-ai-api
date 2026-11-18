import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessPhaseCIssuerApprovalEvidence
} from "../../src/services/authorization/assessPhaseCIssuerApprovalEvidence";

const operationId =
  "11111111-1111-4111-8111-111111111111";
const requestId =
  "22222222-2222-4222-8222-222222222222";

const approval = {
  state: "approved",
  user: { login: "Hope-2018" },
  environments: [{ name: "HOPE-Phase-C-Job-Creation" }]
};

const valid = {
  operationId,
  requestId,
  run: {
    id: 123,
    repository: { full_name: "HOPEpicenter/hope-ai-api" },
    path: ".github/workflows/phase-c-protected-job-creation.yml",
    event: "workflow_dispatch",
    head_branch: "main"
  },
  job: {
    run_id: 123,
    name: `DISABLED operation=${operationId} request=${requestId}`
  },
  history: [approval]
};

function assess(value: unknown) {
  return assessPhaseCIssuerApprovalEvidence(value);
}

test("consistent evidence never authorizes issuance", () => {
  assert.deepEqual(assess(valid), {
    status: "evidence_consistent_not_authenticated",
    evidenceAuthenticated: false,
    issuanceAuthorized: false,
    executionAuthorized: false,
    retryAuthorized: false
  });
});

test("wrong workflow identity denied", () => {
  assert.equal(assess({
    ...valid,
    run: { ...valid.run, path: "deploy.yml" }
  }).status, "workflow_mismatch");
});

test("wrong job operation binding denied", () => {
  assert.equal(assess({
    ...valid,
    job: { ...valid.job, name: "other" }
  }).status, "job_mismatch");
});

test("protected rejection overrides matching approval", () => {
  assert.equal(assess({
    ...valid,
    history: [
      approval,
      { ...approval, state: "rejected" }
    ]
  }).status, "approval_rejected");
});

test("duplicate protected approvals denied", () => {
  assert.equal(assess({
    ...valid,
    history: [approval, approval]
  }).status, "approval_not_unique");
});

test("wrong reviewer denied", () => {
  assert.equal(assess({
    ...valid,
    history: [{
      ...approval,
      user: { login: "other-reviewer" }
    }]
  }).status, "approval_not_unique");
});

test("wrong approval environment denied", () => {
  assert.equal(assess({
    ...valid,
    history: [{
      ...approval,
      environments: [{ name: "Production" }]
    }]
  }).status, "approval_not_unique");
});

test("empty and malformed approval history denied", () => {
  assert.equal(assess({
    ...valid,
    history: []
  }).status, "invalid");

  assert.equal(assess({
    ...valid,
    history: [{ state: "approved" }]
  }).status, "invalid");
});

test("noncanonical operation and request IDs denied", () => {
  assert.equal(assess({
    ...valid,
    operationId: "not-a-uuid"
  }).status, "invalid");

  assert.equal(assess({
    ...valid,
    requestId: operationId
  }).status, "invalid");
});

test("caller authentication assertion grants nothing", () => {
  const result = assess({
    ...valid,
    authenticated: true,
    issuanceAuthorized: true,
    executionAuthorized: true
  });

  assert.equal(
    result.status,
    "evidence_consistent_not_authenticated"
  );
  assert.equal(result.evidenceAuthenticated, false);
  assert.equal(result.issuanceAuthorized, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});