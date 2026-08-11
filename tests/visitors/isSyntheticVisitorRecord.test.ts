import assert from "node:assert/strict";
import {
  isSyntheticVisitorRecord
} from "../../src/services/visitors/isSyntheticVisitorRecord";
import {
  isSyntheticOperationalRecord
} from "../../src/services/ops/isSyntheticOperationalRecord";

const syntheticCases = [
  {
    name: "visitor create contract",
    input: {
      visitorId: "visitor-create-1",
      name: "Visitor Create Contract",
      email: "visitor-create-contract+abc123@example.com"
    }
  },
  {
    name: "pilot acceptance automation",
    input: {
      visitorId: "visitor-pilot-acceptance",
      name: "Pilot Acceptance 20260727154251 Updated",
      email: "pilot.acceptance.20260727154251@example.com"
    }
  },
  {
    name: "staging legacy actor proof",
    input: {
      visitorId: "visitor-staging-legacy",
      name: "Staging Legacy Actor Proof abc123",
      email: "staging-legacy-abc123@example.com"
    }
  },
  {
    name: "people test artifact",
    input: {
      visitorId: "visitor-people-test",
      name: "People Test",
      email: "pemail@test.gmail.com"
    }
  },
  {
    name: "existing regression convention",
    input: {
      visitorId: "visitor-regression",
      email: "contract+regression@example.com"
    }
  },
  {
    name: "explicit metadata",
    input: {
      visitorId: "visitor-metadata",
      metadata: {
        synthetic: true
      }
    }
  }
];

for (const testCase of syntheticCases) {
  assert.equal(
    isSyntheticVisitorRecord(testCase.input),
    true,
    `${testCase.name} should be classified as synthetic`
  );

  assert.equal(
    isSyntheticOperationalRecord(testCase.input),
    true,
    `${testCase.name} should preserve OPS compatibility`
  );
}

const ministryCases = [
  {
    visitorId: "2a21a2ab-805b-46db-abfc-e219427f56db",
    name: "Melissa Carter",
    email: "pilot.melissa.carter@hope.test"
  },
  {
    visitorId: "d5fb29d8-12cf-45be-93a0-fb0a51baec74",
    name: "Grace Williams",
    email: "pilot.grace.williams@hope.test"
  },
  {
    visitorId: "visitor-normal-test-word",
    name: "Testimony Ministry",
    email: "person@example.org"
  }
];

for (const input of ministryCases) {
  assert.equal(
    isSyntheticVisitorRecord(input),
    false,
    `${input.name} should remain a ministry record`
  );
}

console.log("isSyntheticVisitorRecord.test.ts passed");