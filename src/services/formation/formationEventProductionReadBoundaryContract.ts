import { types as utilTypes } from "util";

const REQUIREMENTS = [
  Object.freeze({
    id: "feature_enabled_default_off",
    description: "Explicit feature enablement is required; the default remains off."
  }),
  Object.freeze({
    id: "entra_enforcement_without_legacy_fallback",
    description: "Entra enforcement is required and legacy administrator fallback is prohibited."
  }),
  Object.freeze({
    id: "validated_bearer_token",
    description: "Trusted infrastructure must validate the bearer token."
  }),
  Object.freeze({
    id: "canonical_active_administrator_identity",
    description: "Trusted infrastructure must establish the canonical active administrator identity."
  }),
  Object.freeze({
    id: "system_admin_authorization",
    description: "Authorization must require the system.admin permission."
  }),
  Object.freeze({
    id: "formation_event_acquisition_identity_validation",
    description: "The request identity must satisfy FormationEvent evidence acquisition validation."
  }),
  Object.freeze({
    id: "trusted_backend_reader_composition",
    description: "The eventual reader must come from trusted backend composition, never request data."
  }),
  Object.freeze({
    id: "formation_event_v1_storage_model_and_keys",
    description: "The reader must target current_formation_events_writer_v1 with partitionKey equal to visitorId and deterministic rowKey occurredAt__eventId."
  }),
  Object.freeze({
    id: "narrow_read_operation",
    description: "The boundary may expose only a narrow read operation, never an unrestricted Azure storage client."
  }),
  Object.freeze({
    id: "advisory_read_only_evidence",
    description: "Evidence must remain advisory, read-only, and non-authoritative; it cannot approve writes, repair, retry, replay, reconciliation, or visitor contact."
  })
] as const;

export const FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1 = Object.freeze({
  contractVersion: "formation_event_production_read_boundary.v1",
  scope: "synthetic_only",
  productionBoundaryImplemented: false,
  requirements: Object.freeze(REQUIREMENTS)
});

type RequirementId = (typeof REQUIREMENTS)[number]["id"];
type AssertableRequirementId = Exclude<RequirementId, "feature_enabled_default_off">;

export type FormationEventProductionReadBoundarySyntheticInputV1 = {
  readonly syntheticFeatureSetting: "enabled" | "disabled";
  readonly assertions: readonly {
    readonly requirementId: AssertableRequirementId;
    readonly claim: "satisfied" | "contradicted";
  }[];
};

export type FormationEventProductionReadBoundaryAssessmentV1 = {
  readonly contractVersion: "formation_event_production_read_boundary.v1";
  readonly assessment: "synthetic_only_blocked";
  readonly inputValidity: "valid_synthetic_input" | "malformed_input";
  readonly syntheticFeatureSetting: "enabled" | "disabled" | "invalid";
  readonly productionReadReady: false;
  readonly productionAuthorizationGranted: false;
  readonly productionReadOperationExposed: false;
  readonly advisoryOnly: true;
  readonly readOnly: true;
  readonly authoritative: false;
  readonly writesAllowed: false;
  readonly repairAllowed: false;
  readonly retryAllowed: false;
  readonly replayAllowed: false;
  readonly reconciliationAllowed: false;
  readonly visitorContactAllowed: false;
  readonly unverifiedRequirementIds: readonly RequirementId[];
  readonly reportedContradictions: readonly RequirementId[];
};

const REQUIREMENT_IDS: readonly RequirementId[] = Object.freeze(
  REQUIREMENTS.map(requirement => requirement.id)
);
const ASSERTABLE_REQUIREMENT_IDS: readonly AssertableRequirementId[] = Object.freeze(
  REQUIREMENT_IDS.filter(
    (id): id is AssertableRequirementId => id !== "feature_enabled_default_off"
  )
);

function isAssertableRequirementId(value: unknown): value is AssertableRequirementId {
  return typeof value === "string"
    && ASSERTABLE_REQUIREMENT_IDS.some(requirementId => requirementId === value);
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
  requirementId: AssertableRequirementId;
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

  const seen = new Set<string>();
  const captured: {
    requirementId: AssertableRequirementId;
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
      || !isAssertableRequirementId(assertion.requirementId)
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
  inputValidity: FormationEventProductionReadBoundaryAssessmentV1["inputValidity"],
  syntheticFeatureSetting: FormationEventProductionReadBoundaryAssessmentV1["syntheticFeatureSetting"],
  reportedContradictions: readonly RequirementId[]
): FormationEventProductionReadBoundaryAssessmentV1 {
  return Object.freeze({
    contractVersion: "formation_event_production_read_boundary.v1",
    assessment: "synthetic_only_blocked",
    inputValidity,
    syntheticFeatureSetting,
    productionReadReady: false,
    productionAuthorizationGranted: false,
    productionReadOperationExposed: false,
    advisoryOnly: true,
    readOnly: true,
    authoritative: false,
    writesAllowed: false,
    repairAllowed: false,
    retryAllowed: false,
    replayAllowed: false,
    reconciliationAllowed: false,
    visitorContactAllowed: false,
    unverifiedRequirementIds: REQUIREMENT_IDS,
    reportedContradictions: Object.freeze([...reportedContradictions])
  });
}

/**
 * Reports synthetic claims and gaps only. Caller-provided values, including
 * claims of trusted provenance, never establish production readiness or access.
 */
export function assessFormationEventProductionReadBoundary(
  input: unknown
): FormationEventProductionReadBoundaryAssessmentV1 {
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
      return assessment("malformed_input", "invalid", []);
    }

    const assertions = captureAssertions(captured.assertions);
    if (!assertions) return assessment("malformed_input", "invalid", []);

    const contradictions = new Set<RequirementId>();
    if (captured.syntheticFeatureSetting === "disabled") {
      contradictions.add("feature_enabled_default_off");
    }
    for (const assertion of assertions) {
      if (assertion.claim === "contradicted") {
        contradictions.add(assertion.requirementId);
      }
    }

    return assessment(
      "valid_synthetic_input",
      captured.syntheticFeatureSetting,
      REQUIREMENT_IDS.filter(id => contradictions.has(id))
    );
  } catch {
    return assessment("malformed_input", "invalid", []);
  }
}
