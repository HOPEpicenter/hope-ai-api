import { normalizeEntraStaffBinding } from "./projectStaffDirectory";

export const STAFF_WRITER_MUTATION_CATEGORIES = [
  "profile_update",
  "identity_creation",
  "binding_change",
  "status_transition",
  "deactivation",
  "invitation",
  "activation"
] as const;

export type StaffWriterMutationCategory =
  typeof STAFF_WRITER_MUTATION_CATEGORIES[number];

export type StaffWriterPathway =
  | "identity_creation"
  | "identity_update"
  | "invitation_creation"
  | "invitation_activation";

export type StaffSecurityState =
  | "absent"
  | "pending"
  | "active"
  | "revoked";

export type StaffWriterBindingIdentity = Readonly<{
  entraTenantId: string;
  entraObjectId: string;
}>;

export type StaffWriterCoordinationRequest = Readonly<{
  mutationCategory: StaffWriterMutationCategory | string;
  operationId: string;
  eventId: string;
  expectedSecurityRevision: number;
  expectedStaffId: string;
  expectedStaffState: StaffSecurityState;
  targetStaffState?: StaffSecurityState;
  bindingIdentity?: StaffWriterBindingIdentity | null;
}>;

export type StaffWriterEvidenceState =
  | "missing"
  | "committed"
  | "rejected"
  | "pending"
  | "inconsistent"
  | "uncertain";

export type StaffSecurityDecisionEvidence = Readonly<{
  state: StaffWriterEvidenceState | "not_required";
  operationId?: string;
  eventId?: string;
  staffId?: string;
  mutationCategory?: string;
  expectedRevision?: number;
  revision?: number;
  previousStaffState?: StaffSecurityState;
  resultingStaffState?: StaffSecurityState;
  bindingIdentity?: StaffWriterBindingIdentity | null;
  rejectionReason?:
    | "stale_revision"
    | "binding_conflict"
    | "revocation_conflict"
    | "duplicate_operation"
    | "storage_rejected"
    | "other";
}>;

export type StaffEventsPersistenceEvidence = Readonly<{
  state: StaffWriterEvidenceState;
  operationId?: string;
  eventId?: string;
  staffId?: string;
  mutationCategory?: string;
  bindingIdentity?: StaffWriterBindingIdentity | null;
}>;

export type StaffProjectionEvidence = Readonly<{
  state: "missing" | "projected" | "inconsistent" | "uncertain";
  operationId?: string;
  eventId?: string;
  staffId?: string;
  mutationCategory?: string;
  securityRevision?: number;
  bindingIdentity?: StaffWriterBindingIdentity | null;
}>;

export type StaffInvitationSideEffect =
  | "not_applicable"
  | "not_started"
  | "succeeded"
  | "failed"
  | "uncertain";

export type StaffWriterCoordinationEvidence = Readonly<{
  securityDecision: StaffSecurityDecisionEvidence;
  staffEventsPersistence: StaffEventsPersistenceEvidence;
  projection: StaffProjectionEvidence;
  invitationSideEffect: StaffInvitationSideEffect;
}>;

export type StaffWriterCoordinationStatus =
  | "committed"
  | "rejected"
  | "pending"
  | "inconsistent"
  | "uncertain";

export type StaffWriterCoordinationResult = Readonly<{
  status: StaffWriterCoordinationStatus;
  pathway: StaffWriterPathway | null;
  reason:
    | "evidence_complete"
    | "security_decision_rejected"
    | "evidence_pending"
    | "invalid_or_contradictory_evidence"
    | "acknowledgement_uncertain"
    | "unsupported_mutation_category";
  reconciliationRequired: boolean;
  manualInterventionRequired: boolean;
  executionPermitted: false;
  retryPermitted: false;
  authoritative: false;
}>;

const categories = new Set<string>(
  STAFF_WRITER_MUTATION_CATEGORIES
);
const identifierPattern =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const states = new Set<string>([
  "absent",
  "pending",
  "active",
  "revoked"
]);
const evidenceStates = new Set<string>([
  "missing",
  "committed",
  "rejected",
  "pending",
  "inconsistent",
  "uncertain"
]);
const rejectionReasons = new Set<string>([
  "stale_revision",
  "binding_conflict",
  "revocation_conflict",
  "duplicate_operation",
  "storage_rejected",
  "other"
]);

const nonAuthorizing = {
  executionPermitted: false,
  retryPermitted: false,
  authoritative: false
} as const;

function result(
  status: StaffWriterCoordinationStatus,
  reason: StaffWriterCoordinationResult["reason"],
  pathway: StaffWriterPathway | null,
  reconciliationRequired: boolean,
  manualInterventionRequired = false
): StaffWriterCoordinationResult {
  return {
    status,
    pathway,
    reason,
    reconciliationRequired,
    manualInterventionRequired,
    ...nonAuthorizing
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    identifierPattern.test(value);
}

function isStaffState(value: unknown): value is StaffSecurityState {
  return typeof value === "string" && states.has(value);
}

function normalizeBinding(
  value: unknown
): StaffWriterBindingIdentity | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return "invalid";
  }

  const normalized = normalizeEntraStaffBinding(
    value.entraTenantId,
    value.entraObjectId
  );

  return normalized ?? "invalid";
}

function sameBinding(
  left: StaffWriterBindingIdentity | null,
  right: StaffWriterBindingIdentity | null
): boolean {
  return left === null || right === null
    ? left === right
    : left.entraTenantId === right.entraTenantId &&
      left.entraObjectId === right.entraObjectId;
}

function pathwayFor(
  category: StaffWriterMutationCategory
): StaffWriterPathway {
  switch (category) {
    case "identity_creation":
      return "identity_creation";
    case "invitation":
      return "invitation_creation";
    case "activation":
      return "invitation_activation";
    case "profile_update":
    case "binding_change":
    case "status_transition":
    case "deactivation":
      return "identity_update";
  }
}

function bindingRequired(
  category: StaffWriterMutationCategory
): boolean {
  return category === "binding_change" ||
    category === "invitation" ||
    category === "activation";
}

function hasValidRequest(
  request: unknown
): request is StaffWriterCoordinationRequest {
  if (!isRecord(request)) {
    return false;
  }

  const binding = normalizeBinding(request.bindingIdentity);
  const category = request.mutationCategory;
  const categorySupported =
    typeof category === "string" && categories.has(category);

  if (
    !categorySupported ||
    !isIdentifier(request.operationId) ||
    !isIdentifier(request.eventId) ||
    !isIdentifier(request.expectedStaffId) ||
    !Number.isSafeInteger(request.expectedSecurityRevision) ||
    (request.expectedSecurityRevision as number) < 0 ||
    !isStaffState(request.expectedStaffState) ||
    (request.targetStaffState !== undefined &&
      !isStaffState(request.targetStaffState)) ||
    binding === "invalid"
  ) {
    return false;
  }

  const typedCategory = category as StaffWriterMutationCategory;
  if (bindingRequired(typedCategory) && binding === null) {
    return false;
  }
  if (
    (typedCategory === "identity_creation" ||
      typedCategory === "invitation") &&
    request.expectedStaffState !== "absent"
  ) {
    return false;
  }
  if (
    (typedCategory === "activation" &&
      request.expectedStaffState !== "pending") ||
    (typedCategory === "deactivation" &&
      request.expectedStaffState !== "active") ||
    (typedCategory === "identity_creation" &&
      request.targetStaffState !== "active") ||
    (typedCategory === "binding_change" &&
      request.targetStaffState !== undefined &&
      request.targetStaffState !== request.expectedStaffState) ||
    (typedCategory === "status_transition" &&
      request.targetStaffState !== "active" &&
      request.targetStaffState !== "revoked") ||
    (request.expectedStaffState === "revoked" &&
      request.targetStaffState === "active")
  ) {
    return false;
  }
  if (
    typedCategory !== "identity_creation" &&
    typedCategory !== "invitation" &&
    request.expectedStaffState === "absent"
  ) {
    return false;
  }
  if (
    (typedCategory === "invitation" &&
      request.targetStaffState !== "pending") ||
    (typedCategory === "activation" &&
      request.targetStaffState !== "active") ||
    (typedCategory === "deactivation" &&
      request.targetStaffState !== "revoked")
  ) {
    return false;
  }

  return true;
}

function validEvidenceShape(evidence: unknown): boolean {
  if (!isRecord(evidence)) {
    return false;
  }

  const security = evidence.securityDecision;
  const persistence = evidence.staffEventsPersistence;
  const projection = evidence.projection;
  const invitationSideEffect = evidence.invitationSideEffect;

  if (
    !isRecord(security) ||
    !isRecord(persistence) ||
    !isRecord(projection) ||
    (security.state !== "not_required" &&
      (typeof security.state !== "string" ||
        !evidenceStates.has(security.state))) ||
    typeof persistence.state !== "string" ||
    !evidenceStates.has(persistence.state) ||
    !["missing", "projected", "inconsistent", "uncertain"].includes(
      String(projection.state)
    ) ||
    ![
      "not_applicable",
      "not_started",
      "succeeded",
      "failed",
      "uncertain"
    ].includes(String(invitationSideEffect))
  ) {
    return false;
  }

  for (const record of [security, persistence, projection]) {
    for (const key of ["operationId", "eventId", "staffId"]) {
      if (record[key] !== undefined && !isIdentifier(record[key])) {
        return false;
      }
    }
    if (
      record.mutationCategory !== undefined &&
      (typeof record.mutationCategory !== "string" ||
        !categories.has(record.mutationCategory))
    ) {
      return false;
    }
    if (
      record.bindingIdentity !== undefined &&
      normalizeBinding(record.bindingIdentity) === "invalid"
    ) {
      return false;
    }
  }

  if (
    security.expectedRevision !== undefined &&
    (!Number.isSafeInteger(security.expectedRevision) ||
      (security.expectedRevision as number) < 0)
  ) {
    return false;
  }
  if (
    security.revision !== undefined &&
    (!Number.isSafeInteger(security.revision) ||
      (security.revision as number) < 0)
  ) {
    return false;
  }
  if (
    projection.securityRevision !== undefined &&
    (!Number.isSafeInteger(projection.securityRevision) ||
      (projection.securityRevision as number) < 0)
  ) {
    return false;
  }
  if (
    security.previousStaffState !== undefined &&
    !isStaffState(security.previousStaffState)
  ) {
    return false;
  }
  if (
    security.resultingStaffState !== undefined &&
    !isStaffState(security.resultingStaffState)
  ) {
    return false;
  }
  if (
    security.rejectionReason !== undefined &&
    (typeof security.rejectionReason !== "string" ||
      !rejectionReasons.has(security.rejectionReason))
  ) {
    return false;
  }

  return true;
}

function identityEvidenceMatches(
  record: Record<string, unknown>,
  request: StaffWriterCoordinationRequest,
  bindingIdentity: StaffWriterBindingIdentity | null,
  requireAll: boolean
): boolean {
  const evidenceBinding = normalizeBinding(record.bindingIdentity);
  if (
    evidenceBinding === "invalid" ||
    (evidenceBinding !== null &&
      !sameBinding(evidenceBinding, bindingIdentity)) ||
    (requireAll && bindingIdentity !== null && evidenceBinding === null)
  ) {
    return false;
  }

  const expected: Record<string, unknown> = {
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.expectedStaffId,
    mutationCategory: request.mutationCategory
  };

  if (bindingIdentity !== null) {
    expected.bindingIdentity = bindingIdentity;
  }

  for (const [key, value] of Object.entries(expected)) {
    if (key === "bindingIdentity") {
      continue;
    } else if (
      record[key] !== undefined
        ? record[key] !== value
        : requireAll
    ) {
      return false;
    }
  }

  return true;
}

function isRequiredState(
  category: StaffWriterMutationCategory,
  targetState: StaffSecurityState
): boolean {
  if (category === "invitation") {
    return targetState === "pending";
  }
  if (category === "activation") {
    return targetState === "active";
  }
  if (category === "deactivation") {
    return targetState === "revoked";
  }
  return true;
}

/**
 * Evaluates separately persisted security and StaffEvents evidence.
 *
 * This is a pure contract only: it neither coordinates the writes nor
 * grants authorization. A successful event append cannot establish a
 * security decision, and separate storage writes are not atomic.
 */
export function evaluateStaffWriterCoordination(
  request: StaffWriterCoordinationRequest,
  evidence: StaffWriterCoordinationEvidence
): StaffWriterCoordinationResult {
  const categoryValue = (request as unknown as Record<string, unknown>)
    ?.mutationCategory;

  if (
    typeof categoryValue !== "string" ||
    !categories.has(categoryValue)
  ) {
    return result(
      "rejected",
      "unsupported_mutation_category",
      null,
      false
    );
  }

  const category = categoryValue as StaffWriterMutationCategory;
  const pathway = pathwayFor(category);

  if (!hasValidRequest(request) || !validEvidenceShape(evidence)) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  const requestBinding = normalizeBinding(request.bindingIdentity);
  if (requestBinding === "invalid") {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }
  const bindingIdentity = requestBinding;
  const security = evidence.securityDecision as unknown as Record<
    string,
    unknown
  >;
  const persistence = evidence.staffEventsPersistence as unknown as Record<
    string,
    unknown
  >;
  const projection = evidence.projection as unknown as Record<
    string,
    unknown
  >;
  const securityState = security.state;
  const persistenceState = persistence.state;
  const projectionState = projection.state;
  const isInvitation = category === "invitation";
  const invitationState = evidence.invitationSideEffect;

  if (
    (isInvitation && invitationState === "not_applicable") ||
    (!isInvitation && invitationState !== "not_applicable")
  ) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  if (securityState === "not_required") {
    return result(
      "pending",
      "evidence_pending",
      pathway,
      true,
      true
    );
  }

  const requiredEvidenceIdentity = [
    [
      security,
      securityState === "committed" || securityState === "rejected"
    ],
    [
      persistence,
      persistenceState === "committed" || persistenceState === "rejected"
    ],
    [projection, projectionState === "projected"]
  ] as const;
  if (
    requiredEvidenceIdentity.some(([record, requireAll]) =>
      !identityEvidenceMatches(
        record,
        request,
        bindingIdentity,
        requireAll
      )
    )
  ) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  if (
    securityState === "inconsistent" ||
    persistenceState === "inconsistent" ||
    projectionState === "inconsistent"
  ) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  if (
    securityState === "uncertain" ||
    persistenceState === "uncertain" ||
    projectionState === "uncertain" ||
    invitationState === "uncertain"
  ) {
    return result(
      "uncertain",
      "acknowledgement_uncertain",
      pathway,
      true,
      true
    );
  }

  if (
    securityState === "rejected" &&
    (persistenceState === "committed" ||
      projectionState === "projected" ||
      invitationState === "succeeded")
  ) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  if (
    isInvitation &&
    invitationState === "failed"
  ) {
    if (
      securityState === "committed" ||
      persistenceState === "committed" ||
      projectionState === "projected"
    ) {
      return result(
        "inconsistent",
        "invalid_or_contradictory_evidence",
        pathway,
        true,
        true
      );
    }

    return result(
      "rejected",
      "security_decision_rejected",
      pathway,
      false
    );
  }

  if (
    securityState === "rejected" &&
    (security.rejectionReason === "revocation_conflict" ||
      security.rejectionReason === "stale_revision" ||
      security.rejectionReason === "binding_conflict" ||
      security.rejectionReason === "duplicate_operation" ||
      security.rejectionReason === "storage_rejected")
  ) {
    return result(
      "rejected",
      "security_decision_rejected",
      pathway,
      false
    );
  }

  if (securityState === "committed") {
    const committedRevision = request.expectedSecurityRevision + 1;
    if (
      security.expectedRevision !== request.expectedSecurityRevision ||
      security.revision !== committedRevision ||
      security.previousStaffState !== request.expectedStaffState ||
      !isStaffState(security.resultingStaffState) ||
      (request.targetStaffState !== undefined &&
        security.resultingStaffState !== request.targetStaffState) ||
      !isRequiredState(category, security.resultingStaffState) ||
      (projectionState === "projected" &&
        projection.securityRevision !== committedRevision)
    ) {
      return result(
        "inconsistent",
        "invalid_or_contradictory_evidence",
        pathway,
        true,
        true
      );
    }
  }
  if (
    security.expectedRevision !== undefined &&
    security.expectedRevision !== request.expectedSecurityRevision
  ) {
    return result(
      "inconsistent",
      "invalid_or_contradictory_evidence",
      pathway,
      true,
      true
    );
  }

  if (
    securityState === "rejected" ||
    securityState === "missing" ||
    securityState === "pending" ||
    persistenceState !== "committed" ||
    projectionState !== "projected" ||
    (isInvitation && invitationState !== "succeeded")
  ) {
    const externalInvitationNeedsRecovery =
      isInvitation && invitationState === "succeeded";
    const invitationLocalCommitNeedsRecovery =
      isInvitation &&
      invitationState !== "succeeded" &&
      (securityState === "committed" ||
        persistenceState === "committed" ||
        projectionState === "projected");
    const eventPersistedWithoutSecurity =
      securityState !== "committed" &&
      (persistenceState === "committed" ||
        projectionState === "projected");

    if (
      securityState === "rejected" &&
      !eventPersistedWithoutSecurity &&
      !externalInvitationNeedsRecovery
    ) {
      return result(
        "rejected",
        "security_decision_rejected",
        pathway,
        false
      );
    }

    if (
      persistenceState === "rejected" &&
      securityState !== "committed" &&
      !externalInvitationNeedsRecovery
    ) {
      return result(
        "rejected",
        "evidence_pending",
        pathway,
        true
      );
    }

    return result(
      "pending",
      "evidence_pending",
      pathway,
      true,
      externalInvitationNeedsRecovery ||
        invitationLocalCommitNeedsRecovery ||
        eventPersistedWithoutSecurity ||
        (securityState === "committed" &&
          persistenceState === "rejected")
    );
  }

  return result(
    "committed",
    "evidence_complete",
    pathway,
    false
  );
}
