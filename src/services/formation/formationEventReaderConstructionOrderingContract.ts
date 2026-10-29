import { types as utilTypes } from "util";

const REQUIREMENTS = [
  Object.freeze({
    id: "formation_event_acquisition_identity_validation",
    description: "Validate the FormationEvent acquisition identity before any authorization work."
  }),
  Object.freeze({
    id: "feature_enablement_and_entra_enforcement",
    description: "Confirm explicit server-side feature enablement and valid Entra enforcement configuration."
  }),
  Object.freeze({
    id: "bearer_token_verification",
    description: "Trusted infrastructure must verify bearer-token authentication."
  }),
  Object.freeze({
    id: "canonical_active_administrator_identity",
    description: "Trusted infrastructure must establish the canonical active administrator identity."
  }),
  Object.freeze({
    id: "system_admin_authorization",
    description: "Trusted infrastructure must authorize the administrator for system.admin."
  }),
  Object.freeze({
    id: "trusted_narrow_reader_construction",
    description: "Only after every preceding requirement succeeds may trusted backend composition construct the narrow FormationEvent V1 reader."
  }),
  Object.freeze({
    id: "advisory_read_only_evidence_inspection",
    description: "Subsequent evidence inspection must remain narrow, advisory, read-only, and non-authoritative."
  })
] as const;

const PREREQUISITE_IDS = Object.freeze([
  "formation_event_acquisition_identity_validation",
  "feature_enablement_and_entra_enforcement",
  "bearer_token_verification",
  "canonical_active_administrator_identity",
  "system_admin_authorization"
] as const);

type RequirementId = (typeof REQUIREMENTS)[number]["id"];
type PrerequisiteId = (typeof PREREQUISITE_IDS)[number];

export const FORMATION_EVENT_READER_CONSTRUCTION_ORDERING_CONTRACT_V1 = Object.freeze({
  contractVersion: "formation_event_reader_construction_ordering.v1",
  scope: "synthetic_only",
  productionBoundaryImplemented: false,
  defaultFeatureSetting: "disabled",
  requirements: Object.freeze(REQUIREMENTS),
  prerequisiteIds: PREREQUISITE_IDS,
  constructionRule: "Trusted backend composition may construct the narrow reader only after all five prerequisite stages succeed in order.",
  evidenceRule: "These requirements describe eventual production use; synthetic caller assertions are not proof that any requirement is satisfied."
});

export type FormationEventReaderConstructionOrderingSyntheticInputV1 = {
  readonly syntheticFeatureSetting: "enabled" | "disabled";
  readonly assertions: readonly {
    readonly requirementId: PrerequisiteId;
    readonly claim: "satisfied" | "contradicted";
  }[];
};

export type FormationEventReaderConstructionOrderingAssessmentV1 = {
  readonly contractVersion: "formation_event_reader_construction_ordering.v1";
  readonly assessment: "synthetic_only_blocked";
  readonly inputValidity: "valid_synthetic_input" | "malformed_input" | "out_of_order_synthetic_input";
  readonly syntheticFeatureSetting: "enabled" | "disabled" | "invalid";
  readonly syntheticPrerequisiteSequenceSatisfied: boolean;
  readonly productionAuthorizationGranted: false;
  readonly productionReaderConstructionAuthorized: false;
  readonly productionReaderConstructed: false;
  readonly storageAccessPerformed: false;
  readonly productionReadReady: false;
  readonly productionReadOperationExposed: false;
  readonly advisoryOnly: true;
  readonly readOnly: true;
  readonly authoritative: false;
  readonly writesAllowed: false;
  readonly repairAllowed: false;
  readonly retryAllowed: false;
  readonly replayAllowed: false;
  readonly reconciliationAllowed: false;
  readonly outboundCommunicationAllowed: false;
  readonly visitorContactAllowed: false;
  readonly unrestrictedStorageCapabilityExposed: false;
  readonly missingPrerequisiteIds: readonly PrerequisiteId[];
  readonly contradictedPrerequisiteIds: readonly PrerequisiteId[];
  readonly unverifiedProductionRequirementIds: readonly RequirementId[];
};

function isPrerequisiteId(value: unknown): value is PrerequisiteId {
  return typeof value === "string"
    && PREREQUISITE_IDS.some(requirementId => requirementId === value);
}

function isPlainDataObject(value: unknown): value is object {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || utilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function captureExactDataProperties(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | undefined {
  if (!isPlainDataObject(value)) return undefined;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return undefined;
  }

  const captured: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return undefined;
    }
    captured[key] = descriptor.value;
  }
  return captured;
}

function captureAssertions(value: unknown): readonly {
  requirementId: PrerequisiteId;
  claim: "satisfied" | "contradicted";
}[] | undefined {
  if (
    !Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return undefined;
  }

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1
    || !keys.includes("length")
    || keys.some(key => (
      typeof key !== "string"
      || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key))
    ))
  ) {
    return undefined;
  }

  const seen = new Set<PrerequisiteId>();
  const captured: {
    requirementId: PrerequisiteId;
    claim: "satisfied" | "contradicted";
  }[] = [];

  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return undefined;
    }
    const assertion = captureExactDataProperties(
      descriptor.value,
      ["requirementId", "claim"]
    );
    if (
      !assertion
      || !isPrerequisiteId(assertion.requirementId)
      || (assertion.claim !== "satisfied" && assertion.claim !== "contradicted")
      || seen.has(assertion.requirementId)
    ) {
      return undefined;
    }

    seen.add(assertion.requirementId);
    captured.push({
      requirementId: assertion.requirementId,
      claim: assertion.claim
    });
  }
  return captured;
}

function assessment(
  inputValidity: FormationEventReaderConstructionOrderingAssessmentV1["inputValidity"],
  syntheticFeatureSetting: FormationEventReaderConstructionOrderingAssessmentV1["syntheticFeatureSetting"],
  missingPrerequisiteIds: readonly PrerequisiteId[],
  contradictedPrerequisiteIds: readonly PrerequisiteId[],
  syntheticPrerequisiteSequenceSatisfied = false
): FormationEventReaderConstructionOrderingAssessmentV1 {
  return Object.freeze({
    contractVersion: "formation_event_reader_construction_ordering.v1",
    assessment: "synthetic_only_blocked",
    inputValidity,
    syntheticFeatureSetting,
    syntheticPrerequisiteSequenceSatisfied,
    productionAuthorizationGranted: false,
    productionReaderConstructionAuthorized: false,
    productionReaderConstructed: false,
    storageAccessPerformed: false,
    productionReadReady: false,
    productionReadOperationExposed: false,
    advisoryOnly: true,
    readOnly: true,
    authoritative: false,
    writesAllowed: false,
    repairAllowed: false,
    retryAllowed: false,
    replayAllowed: false,
    reconciliationAllowed: false,
    outboundCommunicationAllowed: false,
    visitorContactAllowed: false,
    unrestrictedStorageCapabilityExposed: false,
    missingPrerequisiteIds: Object.freeze([...missingPrerequisiteIds]),
    contradictedPrerequisiteIds: Object.freeze([...contradictedPrerequisiteIds]),
    unverifiedProductionRequirementIds: Object.freeze(
      REQUIREMENTS.map(requirement => requirement.id)
    )
  });
}

/**
 * Assesses synthetic ordering claims only. No claim is trusted production proof;
 * this function constructs no reader, contacts no storage, and grants no authority.
 */
export function assessFormationEventReaderConstructionOrdering(
  input: unknown
): FormationEventReaderConstructionOrderingAssessmentV1 {
  try {
    const captured = captureExactDataProperties(
      input,
      ["syntheticFeatureSetting", "assertions"]
    );
    if (
      !captured
      || (captured.syntheticFeatureSetting !== "enabled"
        && captured.syntheticFeatureSetting !== "disabled")
    ) {
      return assessment("malformed_input", "invalid", PREREQUISITE_IDS, []);
    }

    const assertions = captureAssertions(captured.assertions);
    if (!assertions) {
      return assessment("malformed_input", "invalid", PREREQUISITE_IDS, []);
    }

    const assertionPositions = assertions.map(assertion =>
      PREREQUISITE_IDS.indexOf(assertion.requirementId)
    );
    if (assertionPositions.some((position, index) =>
      index > 0 && position <= assertionPositions[index - 1]
    )) {
      return assessment(
        "out_of_order_synthetic_input",
        captured.syntheticFeatureSetting,
        PREREQUISITE_IDS,
        []
      );
    }

    const claims = new Map(
      assertions.map(assertion => [assertion.requirementId, assertion.claim] as const)
    );
    const missing = PREREQUISITE_IDS.filter(id => !claims.has(id));
    const contradicted = PREREQUISITE_IDS.filter(id =>
      claims.get(id) === "contradicted"
      || (
        id === "feature_enablement_and_entra_enforcement"
        && captured.syntheticFeatureSetting === "disabled"
      )
    );
    const sequenceSatisfied = captured.syntheticFeatureSetting === "enabled"
      && missing.length === 0
      && contradicted.length === 0;

    return assessment(
      "valid_synthetic_input",
      captured.syntheticFeatureSetting,
      missing,
      contradicted,
      sequenceSatisfied
    );
  } catch {
    return assessment("malformed_input", "invalid", PREREQUISITE_IDS, []);
  }
}
