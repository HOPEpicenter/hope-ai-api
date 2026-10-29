import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  FormationEventEvidenceAcquisitionInputV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../src/domain/formation/assessFormationEventAcquisition";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";
import {
  assessFormationEventProductionReadBoundary,
  FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1
} from "../../src/services/formation/formationEventProductionReadBoundaryContract";

const VISITOR_ID = "synthetic-contract-visitor-001";
const EVENT_ID = "synthetic-contract-event-001";
const OCCURRED_AT = "2030-01-02T03:04:05.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(OCCURRED_AT, EVENT_ID);

function assertions(
  claim: "satisfied" | "contradicted" = "satisfied"
): { requirementId: string; claim: "satisfied" | "contradicted" }[] {
  return FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.requirements
    .filter(requirement => requirement.id !== "feature_enabled_default_off")
    .map(requirement => ({ requirementId: requirement.id, claim }));
}

function validSyntheticInput(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    syntheticFeatureSetting: "enabled",
    assertions: assertions(),
    ...overrides
  };
}

function assertPermanentlyBlocked(result: ReturnType<typeof assessFormationEventProductionReadBoundary>): void {
  assert.equal(result.assessment, "synthetic_only_blocked");
  assert.equal(result.productionReadReady, false);
  assert.equal(result.productionAuthorizationGranted, false);
  assert.equal(result.productionReadOperationExposed, false);
}

let passed = 0;
function test(name: string, run: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(run()).then(() => {
    passed++;
    console.log(`PASS ${name}`);
  });
}

async function main(): Promise<void> {
  await test("contract statically represents every required production prerequisite", () => {
    const contract = FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1;
    const requirements = contract.requirements;
    const ids = requirements.map(requirement => requirement.id);

    assert.equal(contract.contractVersion, "formation_event_production_read_boundary.v1");
    assert.equal(contract.scope, "synthetic_only");
    assert.equal(contract.productionBoundaryImplemented, false);
    assert.deepEqual(ids, [
      "feature_enabled_default_off",
      "entra_enforcement_without_legacy_fallback",
      "validated_bearer_token",
      "canonical_active_administrator_identity",
      "system_admin_authorization",
      "formation_event_acquisition_identity_validation",
      "trusted_backend_reader_composition",
      "formation_event_v1_storage_model_and_keys",
      "narrow_read_operation",
      "advisory_read_only_evidence"
    ]);
    assert.match(requirements.find(item => item.id === "formation_event_v1_storage_model_and_keys")!.description, /current_formation_events_writer_v1/);
    assert.match(requirements.find(item => item.id === "formation_event_v1_storage_model_and_keys")!.description, /partitionKey equal to visitorId/);
    assert.match(requirements.find(item => item.id === "formation_event_v1_storage_model_and_keys")!.description, /occurredAt__eventId/);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(requirements), true);
    for (const requirement of requirements) assert.equal(Object.isFrozen(requirement), true);
  });

  await test("disabled synthetic feature setting remains blocked and reports the default-off gap", () => {
    const result = assessFormationEventProductionReadBoundary({
      syntheticFeatureSetting: "disabled",
      assertions: assertions()
    });

    assertPermanentlyBlocked(result);
    assert.equal(result.inputValidity, "valid_synthetic_input");
    assert.equal(result.syntheticFeatureSetting, "disabled");
    assert.ok(result.reportedContradictions.includes("feature_enabled_default_off"));
    assert.ok(Object.isFrozen(result));
  });

  await test("missing and contradictory prerequisite assertions remain unverified and blocked", () => {
    const missing = assessFormationEventProductionReadBoundary({
      syntheticFeatureSetting: "enabled",
      assertions: []
    });
    const contradictory = assessFormationEventProductionReadBoundary({
      syntheticFeatureSetting: "enabled",
      assertions: [
        { requirementId: "entra_enforcement_without_legacy_fallback", claim: "contradicted" },
        { requirementId: "system_admin_authorization", claim: "contradicted" }
      ]
    });

    assertPermanentlyBlocked(missing);
    assert.equal(missing.unverifiedRequirementIds.length, FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.requirements.length);
    assert.deepEqual(contradictory.reportedContradictions, [
      "entra_enforcement_without_legacy_fallback",
      "system_admin_authorization"
    ]);
    assertPermanentlyBlocked(contradictory);
  });

  await test("caller claims of satisfied or trusted provenance cannot establish production authorization", () => {
    const allClaims = assessFormationEventProductionReadBoundary(validSyntheticInput());
    const callerProvenance = assessFormationEventProductionReadBoundary({
      ...validSyntheticInput(),
      provenance: "trusted_backend",
      authorizationVerified: true
    });

    assertPermanentlyBlocked(allClaims);
    assert.equal(allClaims.inputValidity, "valid_synthetic_input");
    assert.equal(allClaims.unverifiedRequirementIds.length, FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.requirements.length);
    assertPermanentlyBlocked(callerProvenance);
    assert.equal(callerProvenance.inputValidity, "malformed_input");
  });

  await test("results contain no credentials, clients, callable reader, or executable permission", () => {
    const result = assessFormationEventProductionReadBoundary(validSyntheticInput());
    const serialized = JSON.stringify(result);
    const forbiddenKeys = /"(?:accessToken|connectionString|azureClient|tableClient|readPort|readOperation|execute|permissionGranted)"\s*:/i;

    assert.doesNotMatch(serialized, forbiddenKeys);
    assert.equal(result.productionAuthorizationGranted, false);
    assert.equal(result.productionReadOperationExposed, false);
    const visit = (value: unknown): void => {
      if (typeof value === "function") assert.fail("assessment returned an executable value");
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === "object" && value !== null) {
        Object.values(value).forEach(visit);
      }
    };
    visit(result);
  });

  await test("malformed, accessor-based, duplicate, and unexpected inputs fail closed", () => {
    const valid = validSyntheticInput();
    const duplicate = [
      { requirementId: "validated_bearer_token", claim: "satisfied" },
      { requirementId: "validated_bearer_token", claim: "satisfied" }
    ];
    const accessor = Object.defineProperty({}, "syntheticFeatureSetting", {
      enumerable: true,
      get: () => "enabled"
    });
    const malformedInputs: unknown[] = [
      null,
      [],
      { ...valid, unknown: true },
      { ...valid, syntheticFeatureSetting: true },
      { ...valid, assertions: "all satisfied" },
      { ...valid, assertions: duplicate },
      { syntheticFeatureSetting: "enabled", assertions: [{ requirementId: "unknown", claim: "satisfied" }] },
      accessor,
      { syntheticFeatureSetting: "enabled", assertions: [{ requirementId: "validated_bearer_token", claim: "satisfied", proof: true }] },
      { syntheticFeatureSetting: "enabled", assertions: [ { requirementId: "validated_bearer_token", claim: "satisfied" }, , ] }
    ];

    for (const input of malformedInputs) {
      const result = assessFormationEventProductionReadBoundary(input);
      assert.equal(result.inputValidity, "malformed_input");
      assert.equal(result.syntheticFeatureSetting, "invalid");
      assertPermanentlyBlocked(result);
    }
  });

  await test("frozen claims and caller-supplied branded-looking data remain non-authoritative", () => {
    const frozenAssertions = Object.freeze(assertions().map(assertion => Object.freeze(assertion)));
    const frozenInput = Object.freeze({
      syntheticFeatureSetting: "enabled",
      assertions: frozenAssertions
    });
    const result = assessFormationEventProductionReadBoundary(frozenInput);

    assert.equal(result.inputValidity, "valid_synthetic_input");
    assertPermanentlyBlocked(result);
    assert.equal(result.unverifiedRequirementIds.length, FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.requirements.length);
  });

  await test("all results prohibit writes, repair, retry, replay, reconciliation, and visitor contact", () => {
    const results = [
      assessFormationEventProductionReadBoundary(validSyntheticInput()),
      assessFormationEventProductionReadBoundary({ unexpected: true })
    ];

    for (const result of results) {
      assert.equal(result.advisoryOnly, true);
      assert.equal(result.readOnly, true);
      assert.equal(result.authoritative, false);
      assert.equal(result.writesAllowed, false);
      assert.equal(result.repairAllowed, false);
      assert.equal(result.retryAllowed, false);
      assert.equal(result.replayAllowed, false);
      assert.equal(result.reconciliationAllowed, false);
      assert.equal(result.visitorContactAllowed, false);
    }
  });

  await test("contract source has no cloud SDK, network, endpoint, scheduler, or storage implementation dependencies", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../../src/services/formation/formationEventProductionReadBoundaryContract.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf8");

    assert.doesNotMatch(source, /\bfrom\s*["']@azure\//i);
    assert.doesNotMatch(source, /\bfrom\s*["'](?:node:)?(?:http|https|net|tls|dgram|child_process|timers)(?:\/|["'])/i);
    assert.doesNotMatch(source, /\b(?:fetch\s*\(|https?\.request\s*\(|app\.(?:http|timer)\s*\(|setInterval\s*\(|makeTableClient\s*\(|getTableClient\s*\()/i);
    assert.match(source, /from "util"/);
  });

  await test("existing evidence assessment and system.admin authorization boundaries remain intact", () => {
    const identity = {
      visitorId: VISITOR_ID,
      eventId: EVENT_ID,
      occurredAt: OCCURRED_AT
    };
    const evidence = {
      partitionKey: VISITOR_ID,
      rowKey: ROW_KEY,
      visitorId: VISITOR_ID,
      id: EVENT_ID,
      occurredAt: OCCURRED_AT
    };
    const acquisitionInput: FormationEventEvidenceAcquisitionInputV1 = {
      identity,
      observation: { availability: "available", record: evidence }
    };
    const existingAssessment = assessFormationEventAcquisition(acquisitionInput);

    assert.equal(existingAssessment.status, "matching_evidence");
    assert.equal(existingAssessment.reasonCode, "record_matches_trusted_identity");
    assert.equal(existingAssessment.candidateRowKey, ROW_KEY);
    assert.equal(existingAssessment.advisoryOnly, true);
    assert.equal(existingAssessment.readOnly, true);
    assert.equal(existingAssessment.authoritative, false);

    const adminServicePath = path.resolve(
      __dirname,
      "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin.ts"
    );
    const authorizationConfigurationPath = path.resolve(
      __dirname,
      "../../src/config/formationEventInspectionAuthorization.ts"
    );
    const adminActorPath = path.resolve(
      __dirname,
      "../../src/functions/_shared/authenticatedAdminStaffActor.ts"
    );
    const adminServiceSource = fs.readFileSync(adminServicePath, "utf8");
    const configurationSource = fs.readFileSync(authorizationConfigurationPath, "utf8");
    const adminActorSource = fs.readFileSync(adminActorPath, "utf8");

    assert.match(adminServiceSource, /await authorization\([\s\S]*?"system\.admin"/);
    assert.match(adminServiceSource, /decision\.action !== "system\.admin"/);
    assert.match(configurationSource, /value === "" \|\| value === "false"/);
    assert.match(configurationSource, /there is no legacy administrator fallback/);
    assert.match(adminActorSource, /authorizeAuthenticatedStaffAction\([\s\S]*?"system\.admin"/);
  });

  console.log(`Passed ${passed} FormationEvent production read-boundary contract tests.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
