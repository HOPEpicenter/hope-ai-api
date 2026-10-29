import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assessFormationEventReaderConstructionOrdering,
  FORMATION_EVENT_READER_CONSTRUCTION_ORDERING_CONTRACT_V1
} from "../../src/services/formation/formationEventReaderConstructionOrderingContract";

const PREREQUISITE_IDS =
  FORMATION_EVENT_READER_CONSTRUCTION_ORDERING_CONTRACT_V1.prerequisiteIds;

function completeAssertions(
  claim: "satisfied" | "contradicted" = "satisfied"
): { requirementId: string; claim: "satisfied" | "contradicted" }[] {
  return PREREQUISITE_IDS.map(requirementId => ({ requirementId, claim }));
}

function validSyntheticInput(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    syntheticFeatureSetting: "enabled",
    assertions: completeAssertions(),
    ...overrides
  };
}

function assertProductionProhibited(
  result: ReturnType<typeof assessFormationEventReaderConstructionOrdering>
): void {
  assert.equal(result.assessment, "synthetic_only_blocked");
  assert.equal(result.productionAuthorizationGranted, false);
  assert.equal(result.productionReaderConstructionAuthorized, false);
  assert.equal(result.productionReaderConstructed, false);
  assert.equal(result.storageAccessPerformed, false);
  assert.equal(result.productionReadReady, false);
  assert.equal(result.productionReadOperationExposed, false);
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  await test("contract declares the ordered eventual requirements, not proof of satisfaction", () => {
    const contract = FORMATION_EVENT_READER_CONSTRUCTION_ORDERING_CONTRACT_V1;
    assert.equal(contract.contractVersion, "formation_event_reader_construction_ordering.v1");
    assert.equal(contract.scope, "synthetic_only");
    assert.equal(contract.productionBoundaryImplemented, false);
    assert.equal(contract.defaultFeatureSetting, "disabled");
    assert.deepEqual(contract.requirements.map(requirement => requirement.id), [
      "formation_event_acquisition_identity_validation",
      "feature_enablement_and_entra_enforcement",
      "bearer_token_verification",
      "canonical_active_administrator_identity",
      "system_admin_authorization",
      "trusted_narrow_reader_construction",
      "advisory_read_only_evidence_inspection"
    ]);
    assert.deepEqual(contract.prerequisiteIds, contract.requirements
      .slice(0, 5)
      .map(requirement => requirement.id));
    assert.match(contract.constructionRule, /only after all five prerequisite stages succeed in order/);
    assert.match(contract.evidenceRule, /synthetic caller assertions are not proof/);
    assert.match(contract.requirements[5].description, /trusted backend composition/);
    assert.match(contract.requirements[6].description, /advisory, read-only, and non-authoritative/);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.requirements), true);
    assert.equal(Object.isFrozen(contract.prerequisiteIds), true);
    for (const requirement of contract.requirements) assert.equal(Object.isFrozen(requirement), true);
  });

  await test("missing input and incomplete claims fail closed by default", () => {
    const defaultResult = assessFormationEventReaderConstructionOrdering(undefined);
    const incomplete = assessFormationEventReaderConstructionOrdering({
      syntheticFeatureSetting: "enabled",
      assertions: []
    });

    assert.equal(defaultResult.inputValidity, "malformed_input");
    assert.equal(defaultResult.syntheticFeatureSetting, "invalid");
    assertProductionProhibited(defaultResult);
    assert.equal(incomplete.inputValidity, "valid_synthetic_input");
    assert.equal(incomplete.syntheticPrerequisiteSequenceSatisfied, false);
    assert.deepEqual(incomplete.missingPrerequisiteIds, PREREQUISITE_IDS);
    assertProductionProhibited(incomplete);
  });

  await test("explicitly disabled synthetic feature prohibits the ordering sequence", () => {
    const result = assessFormationEventReaderConstructionOrdering(
      validSyntheticInput({ syntheticFeatureSetting: "disabled" })
    );

    assert.equal(result.syntheticFeatureSetting, "disabled");
    assert.equal(result.syntheticPrerequisiteSequenceSatisfied, false);
    assert.ok(result.contradictedPrerequisiteIds.includes(
      "feature_enablement_and_entra_enforcement"
    ));
    assertProductionProhibited(result);
  });

  await test("each prerequisite stage is independently required and rejection blocks the sequence", () => {
    for (const requirementId of PREREQUISITE_IDS) {
      const missing = assessFormationEventReaderConstructionOrdering({
        syntheticFeatureSetting: "enabled",
        assertions: completeAssertions().filter(item => item.requirementId !== requirementId)
      });
      assert.equal(missing.syntheticPrerequisiteSequenceSatisfied, false, requirementId);
      assert.ok(missing.missingPrerequisiteIds.includes(requirementId), requirementId);
      assertProductionProhibited(missing);

      const contradicted = assessFormationEventReaderConstructionOrdering({
        syntheticFeatureSetting: "enabled",
        assertions: completeAssertions().map(item => (
          item.requirementId === requirementId
            ? { ...item, claim: "contradicted" as const }
            : item
        ))
      });
      assert.equal(contradicted.syntheticPrerequisiteSequenceSatisfied, false, requirementId);
      assert.ok(contradicted.contradictedPrerequisiteIds.includes(requirementId), requirementId);
      assertProductionProhibited(contradicted);
    }
  });

  await test("malformed, incomplete-shape, duplicate, and contradictory evidence fails closed", () => {
    const accessor = Object.defineProperty({}, "syntheticFeatureSetting", {
      enumerable: true,
      get: () => "enabled"
    });
    const contradictorySetting = validSyntheticInput({
      syntheticFeatureSetting: "disabled"
    });
    const malformedInputs: unknown[] = [
      null,
      [],
      { ...validSyntheticInput(), unexpected: true },
      { ...validSyntheticInput(), syntheticFeatureSetting: true },
      { ...validSyntheticInput(), assertions: "all satisfied" },
      { ...validSyntheticInput(), assertions: [
        ...completeAssertions(),
        completeAssertions()[0]
      ] },
      { ...validSyntheticInput(), assertions: [
        { requirementId: "unknown_stage", claim: "satisfied" }
      ] },
      { ...validSyntheticInput(), assertions: [
        { requirementId: PREREQUISITE_IDS[0], claim: "unknown" }
      ] },
      { ...validSyntheticInput(), assertions: [
        { requirementId: PREREQUISITE_IDS[0], claim: "satisfied", proof: true }
      ] },
      { ...validSyntheticInput(), assertions: [
        { requirementId: PREREQUISITE_IDS[0], claim: "satisfied" },,
      ] },
      accessor
    ];

    for (const input of malformedInputs) {
      const result = assessFormationEventReaderConstructionOrdering(input);
      assert.equal(result.inputValidity, "malformed_input");
      assertProductionProhibited(result);
    }

    const contradictory = assessFormationEventReaderConstructionOrdering(
      contradictorySetting
    );
    assert.equal(contradictory.syntheticPrerequisiteSequenceSatisfied, false);
    assert.ok(contradictory.contradictedPrerequisiteIds.includes(
      "feature_enablement_and_entra_enforcement"
    ));
    assertProductionProhibited(contradictory);
  });

  await test("out-of-order evidence is rejected rather than treated as satisfied", () => {
    const outOfOrder = assessFormationEventReaderConstructionOrdering({
      syntheticFeatureSetting: "enabled",
      assertions: [
        { requirementId: PREREQUISITE_IDS[1], claim: "satisfied" },
        { requirementId: PREREQUISITE_IDS[0], claim: "satisfied" }
      ]
    });
    const laterStageBeforeMissingPrerequisite = assessFormationEventReaderConstructionOrdering({
      syntheticFeatureSetting: "enabled",
      assertions: [
        { requirementId: PREREQUISITE_IDS[2], claim: "satisfied" },
        { requirementId: PREREQUISITE_IDS[0], claim: "satisfied" }
      ]
    });

    for (const result of [outOfOrder, laterStageBeforeMissingPrerequisite]) {
      assert.equal(result.inputValidity, "out_of_order_synthetic_input");
      assert.equal(result.syntheticPrerequisiteSequenceSatisfied, false);
      assertProductionProhibited(result);
    }
  });

  await test("complete synthetic sequence satisfies ordering only, never production authority", () => {
    const input = validSyntheticInput();
    const first = assessFormationEventReaderConstructionOrdering(input);
    const second = assessFormationEventReaderConstructionOrdering(input);

    assert.equal(first.inputValidity, "valid_synthetic_input");
    assert.equal(first.syntheticPrerequisiteSequenceSatisfied, true);
    assert.deepEqual(first, second);
    assert.deepEqual(first.missingPrerequisiteIds, []);
    assert.deepEqual(first.contradictedPrerequisiteIds, []);
    assert.deepEqual(
      first.unverifiedProductionRequirementIds,
      FORMATION_EVENT_READER_CONSTRUCTION_ORDERING_CONTRACT_V1.requirements.map(
        requirement => requirement.id
      )
    );
    assertProductionProhibited(first);
  });

  await test("results are immutable, advisory, read-only, and expose no prohibited capabilities", () => {
    const result = assessFormationEventReaderConstructionOrdering(validSyntheticInput());
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.missingPrerequisiteIds), true);
    assert.equal(Object.isFrozen(result.contradictedPrerequisiteIds), true);
    assert.equal(Object.isFrozen(result.unverifiedProductionRequirementIds), true);
    assert.equal(result.advisoryOnly, true);
    assert.equal(result.readOnly, true);
    assert.equal(result.authoritative, false);
    assert.equal(result.writesAllowed, false);
    assert.equal(result.repairAllowed, false);
    assert.equal(result.retryAllowed, false);
    assert.equal(result.replayAllowed, false);
    assert.equal(result.reconciliationAllowed, false);
    assert.equal(result.outboundCommunicationAllowed, false);
    assert.equal(result.visitorContactAllowed, false);
    assert.equal(result.unrestrictedStorageCapabilityExposed, false);
    const visit = (value: unknown): void => {
      if (typeof value === "function") assert.fail("assessment returned an executable value");
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(visit);
      }
    };
    visit(result);
  });

  await test("contract assessment has no production authorization, reader, storage, route, or contact dependency", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../../src/services/formation/formationEventReaderConstructionOrderingContract.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf8");

    assert.match(source, /from "util"/);
    assert.doesNotMatch(source, /\bfrom\s*["']@azure\//i);
    assert.doesNotMatch(source, /createFormationEventV1BackendReadPort|formationV1TableClient/i);
    assert.doesNotMatch(source, /authorizeAuthenticatedStaffAction|verifyEntraStaffAccessToken/i);
    assert.doesNotMatch(source, /\bprocess\.env\b|\bfetch\s*\(|https?\.request\s*\(/i);
    assert.doesNotMatch(source, /\b(?:app|router)\.(?:http|post|put|patch|delete)\s*\(/i);
    assert.doesNotMatch(source, /\b(?:setInterval|setTimeout)\s*\(/i);

    const result = assessFormationEventReaderConstructionOrdering(validSyntheticInput());
    assertProductionProhibited(result);
    assert.equal(result.productionReaderConstructed, false);
    assert.equal(result.productionReadOperationExposed, false);
  });

  console.log(`Passed ${passed} FormationEvent reader-construction ordering contract tests.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
