import {
  evaluateStaffWriterCoordination,
  type StaffSecurityState,
  type StaffWriterCoordinationRequest,
  type StaffWriterCoordinationResult,
  type StaffWriterMutationCategory
} from "../../domain/staff/staffWriterCoordinationContract";
import {
  classifyStaffSecurityMutation,
  type StaffSecurityMutationKind
} from "../../domain/staff/classifyStaffSecurityMutation";
import {
  type CanonicalStaffIdentity,
  type StaffEvent,
  normalizeEntraStaffBinding
} from "../../domain/staff/projectStaffDirectory";

export type StaffReconciliationRead<T> =
  | Readonly<{ status: "observed"; records: readonly T[] }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "uncertain" }>;

export type StaffSecurityReceiptObservation = Readonly<{
  operationId: string;
  staffId: string;
  tenantId?: string;
  objectId?: string;
  kind: string;
  revision: number;
  eventId?: string;
  mutationCategory?: string;
  expectedRevision?: number;
  previousStaffState?: StaffSecurityState;
  resultingStaffState?: StaffSecurityState;
  outcome?: "committed" | "rejected";
  rejectionReason?:
    | "stale_revision"
    | "binding_conflict"
    | "revocation_conflict"
    | "duplicate_operation"
    | "storage_rejected"
    | "other";
}>;

export type StaffSecurityReceiptKind =
  | "binding.reserved"
  | "binding.released";

export type StaffCurrentBindingObservation = Readonly<{
  staffId: string;
  tenantId: string;
  objectId: string;
  operationId: string;
  ownershipState?: "active" | "released";
}>;

export type StaffEventObservation = Readonly<{
  event: StaffEvent;
  operationId?: string;
}>;

export type StaffProjectionObservation = Readonly<{
  identity: CanonicalStaffIdentity;
  operationId?: string;
  mutationCategory?: string;
  securityRevision?: number;
}>;

export type StaffInvitationOutcomeObservation = Readonly<{
  operationId: string;
  outcome: "succeeded" | "failed" | "uncertain";
}>;

type ObservedBinding =
  | Readonly<{ entraTenantId: string; entraObjectId: string }>
  | null
  | "invalid";

function isObservedBinding(
  binding: ObservedBinding
): binding is Exclude<ObservedBinding, null | "invalid"> {
  return binding !== null && binding !== "invalid";
}

/**
 * Every provider is explicitly injected. Providers report observed facts
 * from their source; they do not decide authorization or infer commits.
 */
export type StaffWriterReconciliationReaders = Readonly<{
  readSecurityReceipts(
    operationId: string
  ): Promise<StaffReconciliationRead<StaffSecurityReceiptObservation>>;
  readCurrentBinding(
    tenantId: string,
    objectId: string
  ): Promise<StaffReconciliationRead<StaffCurrentBindingObservation>>;
  readStaffEvents(
    eventId: string,
    staffId: string
  ): Promise<StaffReconciliationRead<StaffEventObservation>>;
  readStaffProjections(
    staffId: string
  ): Promise<StaffReconciliationRead<StaffProjectionObservation>>;
  readInvitationOutcomes?(
    operationId: string
  ): Promise<StaffReconciliationRead<StaffInvitationOutcomeObservation>>;
}>;

export type StaffWriterReconciliationStatus =
  | "consistent"
  | "incomplete"
  | "missing"
  | "rejected"
  | "contradictory"
  | "uncertain"
  | "unavailable";

export type StaffWriterReconciliationSource =
  | "security_receipt"
  | "current_binding"
  | "staff_event"
  | "projection"
  | "invitation_outcome";

export type StaffWriterReconciliationResult = Readonly<{
  status: StaffWriterReconciliationStatus;
  operationId: string;
  contractEvaluation: StaffWriterCoordinationResult;
  missingEvidence: readonly string[];
  unavailableSources: readonly StaffWriterReconciliationSource[];
  uncertainSources: readonly StaffWriterReconciliationSource[];
  diagnostic:
    | "evidence_correlated"
    | "source_record_missing"
    | "security_decision_rejected"
    | "correlation_fields_not_persisted"
    | "contradictory_records"
    | "source_unavailable"
    | "acknowledgement_uncertain"
    | "invalid_context"
    | "historical_security_evidence"
    | "unsupported_security_receipt_kind";
  reconciliationRequired: boolean;
  manualReviewRequired: boolean;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

const mutationCategories = new Set<string>([
  "profile_update",
  "identity_creation",
  "binding_change",
  "status_transition",
  "deactivation",
  "invitation",
  "activation"
]);
const supportedReceiptKinds = new Set<StaffSecurityReceiptKind>([
  "binding.reserved",
  "binding.released"
]);

const eventTypeToMutationCategory: Readonly<
  Partial<Record<StaffSecurityMutationKind, StaffWriterMutationCategory>>
> = {
  profile_update: "profile_update",
  identity_creation: "identity_creation",
  binding_change: "binding_change",
  status_transition: "status_transition",
  deactivation: "deactivation",
  invitation: "invitation",
  activation: "activation"
};

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false
} as const;

function makeResult(
  request: StaffWriterCoordinationRequest,
  contractEvaluation: StaffWriterCoordinationResult,
  values: Omit<
    StaffWriterReconciliationResult,
    | "operationId"
    | "contractEvaluation"
    | "authoritative"
    | "executionPermitted"
    | "retryPermitted"
  >
): StaffWriterReconciliationResult {
  return {
    operationId:
      typeof request?.operationId === "string"
        ? request.operationId
        : "",
    contractEvaluation,
    ...values,
    ...nonAuthorizing
  };
}

function bindingFromParts(
  tenantId: unknown,
  objectId: unknown
): ObservedBinding {
  if (tenantId === undefined && objectId === undefined) {
    return null;
  }
  const normalized = normalizeEntraStaffBinding(tenantId, objectId);
  return normalized ?? "invalid";
}

function invalidEvaluation(
  request: StaffWriterCoordinationRequest
): StaffWriterCoordinationResult {
  return evaluateStaffWriterCoordination(request, {
    securityDecision: { state: "inconsistent" },
    staffEventsPersistence: { state: "inconsistent" },
    projection: { state: "inconsistent" },
    invitationSideEffect:
      request.mutationCategory === "invitation"
        ? "uncertain"
        : "not_applicable"
  });
}

function isValidContext(
  request: StaffWriterCoordinationRequest
): boolean {
  if (
    !request ||
    typeof request.operationId !== "string" ||
    !request.operationId.trim() ||
    typeof request.eventId !== "string" ||
    !request.eventId.trim() ||
    typeof request.expectedStaffId !== "string" ||
    !request.expectedStaffId.trim() ||
    typeof request.mutationCategory !== "string" ||
    !mutationCategories.has(request.mutationCategory) ||
    !Number.isSafeInteger(request.expectedSecurityRevision) ||
    request.expectedSecurityRevision < 0
  ) {
    return false;
  }

  if (
    request.bindingIdentity === null ||
    request.bindingIdentity === undefined
  ) {
    return true;
  }

  return normalizeEntraStaffBinding(
    request.bindingIdentity.entraTenantId,
    request.bindingIdentity.entraObjectId
  ) !== null;
}

function hasBinding(
  request: StaffWriterCoordinationRequest
): request is StaffWriterCoordinationRequest & {
  bindingIdentity: Readonly<{
    entraTenantId: string;
    entraObjectId: string;
  }>;
} {
  return Boolean(request.bindingIdentity);
}

function invitationSideEffectFor(
  category: string,
  observation:
    | StaffReconciliationRead<StaffInvitationOutcomeObservation>
    | undefined,
  operationId: string,
  missingEvidence: string[]
): "not_applicable" | "not_started" | "succeeded" | "failed" | "uncertain" {
  if (category !== "invitation") {
    return "not_applicable";
  }
  if (!observation) {
    missingEvidence.push("invitation_outcome.reader");
    return "uncertain";
  }
  if (observation.status === "missing") {
    missingEvidence.push("invitation_outcome");
    return "uncertain";
  }
  if (observation.status === "unavailable" ||
      observation.status === "uncertain") {
    return "uncertain";
  }
  if (observation.records.length === 0) {
    missingEvidence.push("invitation_outcome");
    return "uncertain";
  }
  if (observation.records.length !== 1) {
    missingEvidence.push("invitation_outcome.ambiguous");
    return "uncertain";
  }

  const outcome = observation.records[0];
  if (outcome.operationId !== operationId) {
    missingEvidence.push("invitation_outcome.operationId");
    return "uncertain";
  }
  return outcome.outcome;
}

function identityState(status: string): StaffSecurityState | undefined {
  switch (status) {
    case "active":
      return "active";
    case "pending":
      return "pending";
    case "inactive":
      return "revoked";
    default:
      return undefined;
  }
}

function categoryFromEvent(
  event: StaffEvent
): StaffWriterMutationCategory | null {
  const classification = classifyStaffSecurityMutation(event);
  return eventTypeToMutationCategory[classification.kind] ?? null;
}

/**
 * Inspects independently persisted staff-writer evidence.
 *
 * Read absence is never interpreted as proof that a write did not commit.
 * This service has no defaults, writes, retries, or authorization behavior.
 */
export async function inspectStaffWriterReconciliation(
  request: StaffWriterCoordinationRequest,
  readers: StaffWriterReconciliationReaders
): Promise<StaffWriterReconciliationResult> {
  if (!isValidContext(request)) {
    return makeResult(request, invalidEvaluation(request), {
      status: "contradictory",
      missingEvidence: ["request.context"],
      unavailableSources: [],
      uncertainSources: [],
      diagnostic: "invalid_context",
      reconciliationRequired: true,
      manualReviewRequired: true
    });
  }

  const unavailableSources: StaffWriterReconciliationSource[] = [];
  const uncertainSources: StaffWriterReconciliationSource[] = [];
  const missingEvidence: string[] = [];

  const safeRead = async <T>(
    source: StaffWriterReconciliationSource,
    read: () => Promise<StaffReconciliationRead<T>>
  ): Promise<StaffReconciliationRead<T>> => {
    try {
      const value = await read();
      if (value.status === "unavailable") {
        unavailableSources.push(source);
      } else if (value.status === "uncertain") {
        uncertainSources.push(source);
      }
      return value;
    } catch {
      unavailableSources.push(source);
      return { status: "unavailable" };
    }
  };

  const securityRead = await safeRead(
    "security_receipt",
    () => readers.readSecurityReceipts(request.operationId)
  );
  const bindingRead = hasBinding(request)
    ? await safeRead(
        "current_binding",
        () => readers.readCurrentBinding(
          normalizeEntraStaffBinding(
            request.bindingIdentity.entraTenantId,
            request.bindingIdentity.entraObjectId
          )!.entraTenantId,
          normalizeEntraStaffBinding(
            request.bindingIdentity.entraTenantId,
            request.bindingIdentity.entraObjectId
          )!.entraObjectId
        )
      )
    : { status: "missing" as const };
  const eventRead = await safeRead(
    "staff_event",
    () => readers.readStaffEvents(
      request.eventId,
      request.expectedStaffId
    )
  );
  const projectionRead = await safeRead(
    "projection",
    () => readers.readStaffProjections(request.expectedStaffId)
  );
  const invitationRead =
    request.mutationCategory === "invitation"
      ? readers.readInvitationOutcomes
        ? await safeRead(
            "invitation_outcome",
            () => readers.readInvitationOutcomes!(
              request.operationId
            )
          )
        : undefined
      : undefined;

  const securityReceipt =
    securityRead.status === "observed" &&
    securityRead.records.length === 1
      ? securityRead.records[0]
      : undefined;
  const staffEvent =
    eventRead.status === "observed" &&
    eventRead.records.length === 1
      ? eventRead.records[0]
      : undefined;
  const projection =
    projectionRead.status === "observed" &&
    projectionRead.records.length === 1
      ? projectionRead.records[0]
      : undefined;

  const duplicateRecords =
    (securityRead.status === "observed" &&
      securityRead.records.length > 1) ||
    (eventRead.status === "observed" &&
      eventRead.records.length > 1) ||
    (projectionRead.status === "observed" &&
      projectionRead.records.length > 1) ||
    (bindingRead.status === "observed" &&
      bindingRead.records.length > 1) ||
    (invitationRead?.status === "observed" &&
      invitationRead.records.length > 1);

  if (
    securityRead.status === "missing" ||
    (securityRead.status === "observed" &&
      securityRead.records.length === 0)
  ) {
    missingEvidence.push("security_receipt");
  }
  if (
    eventRead.status === "missing" ||
    (eventRead.status === "observed" &&
      eventRead.records.length === 0)
  ) {
    missingEvidence.push("staff_event");
  }
  if (
    projectionRead.status === "missing" ||
    (projectionRead.status === "observed" &&
      projectionRead.records.length === 0)
  ) {
    missingEvidence.push("projection");
  }
  if (
    projection &&
    projection.identity.lastEventId !== request.eventId
  ) {
    missingEvidence.push("projection.lastEventId");
  }
  if (
    hasBinding(request) &&
    (bindingRead.status === "missing" ||
      (bindingRead.status === "observed" &&
        bindingRead.records.length === 0))
  ) {
    missingEvidence.push("current_binding");
  }

  const wrongEvent =
    staffEvent !== undefined &&
    (staffEvent.event.eventId !== request.eventId ||
      staffEvent.event.staffId !== request.expectedStaffId);
  const wrongProjection =
    projection !== undefined &&
    projection.identity.staffId !== request.expectedStaffId;
  const derivedEventCategory = staffEvent
    ? categoryFromEvent(staffEvent.event)
    : null;
  const eventCategoryMismatch =
    derivedEventCategory !== null &&
    derivedEventCategory !== request.mutationCategory;
  const currentBinding =
    hasBinding(request) && bindingRead.status === "observed" &&
    bindingRead.records.length === 1
      ? bindingRead.records[0]
      : undefined;
  const bindingMismatch =
    hasBinding(request) &&
    currentBinding !== undefined &&
    (currentBinding.staffId !== request.expectedStaffId ||
      currentBinding.tenantId.toLowerCase() !==
        request.bindingIdentity.entraTenantId.toLowerCase() ||
      currentBinding.objectId.toLowerCase() !==
        request.bindingIdentity.entraObjectId.toLowerCase());
  const currentBindingReleased =
    hasBinding(request) &&
    currentBinding?.ownershipState === "released";
  const malformedCurrentBindingOwnership =
    currentBinding !== undefined &&
    currentBinding.ownershipState !== undefined &&
    currentBinding.ownershipState !== "active" &&
    currentBinding.ownershipState !== "released";
  const currentBindingHistorical =
    hasBinding(request) &&
    currentBinding !== undefined &&
    currentBinding.ownershipState === "active" &&
    currentBinding.operationId !== request.operationId;
  const securityReceiptMismatch =
    securityReceipt !== undefined &&
    (securityReceipt.operationId !== request.operationId ||
      securityReceipt.staffId !== request.expectedStaffId ||
      (securityReceipt.tenantId !== undefined &&
        hasBinding(request) &&
        securityReceipt.tenantId.toLowerCase() !==
          request.bindingIdentity.entraTenantId.toLowerCase()) ||
      (securityReceipt.objectId !== undefined &&
        hasBinding(request) &&
        securityReceipt.objectId.toLowerCase() !==
          request.bindingIdentity.entraObjectId.toLowerCase()) ||
      (securityReceipt.revision !== request.expectedSecurityRevision + 1));
  const receiptKindSupported =
    securityReceipt !== undefined &&
    supportedReceiptKinds.has(
      securityReceipt.kind as StaffSecurityReceiptKind
    );
  const receiptKindApplicable =
    securityReceipt?.kind === "binding.reserved" &&
    request.mutationCategory === "binding_change";
  const receiptKindHistorical =
    securityReceipt?.kind === "binding.released";
  const receiptBinding = securityReceipt
    ? bindingFromParts(securityReceipt.tenantId, securityReceipt.objectId)
    : null;
  const eventBinding = staffEvent
    ? bindingFromParts(
        staffEvent.event.data.entraTenantId,
        staffEvent.event.data.entraObjectId
      )
    : null;
  const projectionBinding = projection
    ? bindingFromParts(
        projection.identity.entraTenantId,
        projection.identity.entraObjectId
      )
    : null;

  if (receiptBinding === "invalid" ||
      eventBinding === "invalid" ||
      projectionBinding === "invalid") {
    missingEvidence.push("malformed_binding_identity");
  }
  if (hasBinding(request) && receiptBinding === null && securityReceipt) {
    missingEvidence.push("security_receipt.bindingIdentity");
  }
  if (hasBinding(request) && eventBinding === null && staffEvent) {
    missingEvidence.push("staff_event.bindingIdentity");
  }
  if (hasBinding(request) && projectionBinding === null && projection) {
    missingEvidence.push("projection.bindingIdentity");
  }
  if (
    receiptBinding &&
    receiptBinding !== "invalid" &&
    hasBinding(request) &&
    (receiptBinding.entraTenantId !==
      request.bindingIdentity.entraTenantId.toLowerCase() ||
      receiptBinding.entraObjectId !==
        request.bindingIdentity.entraObjectId.toLowerCase())
  ) {
    missingEvidence.push("security_receipt.bindingIdentity_mismatch");
  }

  if (
    securityReceipt &&
    securityReceipt.eventId === undefined
  ) {
    missingEvidence.push("security_receipt.eventId");
  }
  if (
    securityReceipt &&
    securityReceipt.mutationCategory === undefined
  ) {
    missingEvidence.push("security_receipt.mutationCategory");
  }
  if (
    securityReceipt &&
    securityReceipt.expectedRevision === undefined
  ) {
    missingEvidence.push("security_receipt.expectedRevision");
  }
  if (
    securityReceipt &&
    securityReceipt.previousStaffState === undefined
  ) {
    missingEvidence.push("security_receipt.previousStaffState");
  }
  if (
    securityReceipt &&
    securityReceipt.resultingStaffState === undefined
  ) {
    missingEvidence.push("security_receipt.resultingStaffState");
  }
  if (
    staffEvent &&
    staffEvent.operationId === undefined
  ) {
    missingEvidence.push("staff_event.operationId");
  }
  if (
    projection &&
    projection.operationId === undefined
  ) {
    missingEvidence.push("projection.operationId");
  }
  if (
    projection &&
    projection.mutationCategory === undefined
  ) {
    missingEvidence.push("projection.mutationCategory");
  }
  if (
    projection &&
    projection.securityRevision === undefined
  ) {
    missingEvidence.push("projection.securityRevision");
  }
  if (
    hasBinding(request) &&
    currentBinding &&
    currentBinding.ownershipState === undefined
  ) {
    missingEvidence.push("current_binding.ownershipState");
  }
  if (currentBindingHistorical) {
    missingEvidence.push(
      "current_binding.operationId_differs_from_inspected_operation"
    );
  }
  if (receiptKindHistorical) {
    missingEvidence.push(
      "security_receipt.binding_released_is_historical"
    );
  } else if (securityReceipt && !receiptKindApplicable) {
    missingEvidence.push(
      receiptKindSupported
        ? "security_receipt.kind_not_applicable_to_mutation"
        : "security_receipt.kind_unsupported"
    );
  }

  const securityState =
    securityRead.status === "unavailable"
      ? "uncertain"
      : securityRead.status === "uncertain"
        ? "uncertain"
        : securityReceipt && receiptKindApplicable
          ? securityReceipt.outcome ?? "committed"
          : securityReceipt &&
              receiptKindApplicable &&
              securityReceipt.outcome === "rejected"
              ? "rejected"
            : "missing";
  const securityDecision =
    securityReceipt && securityState === "committed"
      ? {
          state: "committed" as const,
          operationId: securityReceipt.operationId,
          ...(securityReceipt.eventId !== undefined
            ? { eventId: securityReceipt.eventId }
            : {}),
          staffId: securityReceipt.staffId,
          ...(securityReceipt.mutationCategory !== undefined
            ? { mutationCategory: securityReceipt.mutationCategory }
            : {}),
          ...(securityReceipt.expectedRevision !== undefined
            ? { expectedRevision: securityReceipt.expectedRevision }
            : {}),
          revision: securityReceipt.revision,
          ...(securityReceipt.previousStaffState !== undefined
            ? { previousStaffState: securityReceipt.previousStaffState }
            : {}),
          ...(securityReceipt.resultingStaffState !== undefined
            ? { resultingStaffState: securityReceipt.resultingStaffState }
            : {}),
          ...(hasBinding(request)
            ? receiptBinding && receiptBinding !== "invalid"
              ? { bindingIdentity: receiptBinding }
              : {}
            : {})
        }
      : securityReceipt && securityState === "rejected"
        ? {
            state: "rejected" as const,
            operationId: securityReceipt.operationId,
            ...(securityReceipt.eventId !== undefined
              ? { eventId: securityReceipt.eventId }
              : {}),
            staffId: securityReceipt.staffId,
            ...(securityReceipt.mutationCategory !== undefined
              ? { mutationCategory: securityReceipt.mutationCategory }
              : {}),
            ...(securityReceipt.expectedRevision !== undefined
              ? { expectedRevision: securityReceipt.expectedRevision }
              : {}),
            ...(securityReceipt.rejectionReason !== undefined
              ? { rejectionReason: securityReceipt.rejectionReason }
              : {}),
            ...(hasBinding(request)
              ? receiptBinding && receiptBinding !== "invalid"
                ? { bindingIdentity: receiptBinding }
                : {}
              : {})
          }
        : { state: securityState as "missing" | "uncertain" };

  const persistenceState =
    eventRead.status === "unavailable"
      ? "uncertain"
      : eventRead.status === "uncertain"
        ? "uncertain"
        : staffEvent
          ? "committed"
          : "missing";
  const persistenceEvidence = staffEvent
    ? {
        state: persistenceState as "committed" | "uncertain",
        ...(staffEvent.operationId !== undefined
          ? { operationId: staffEvent.operationId }
          : {}),
        eventId: staffEvent.event.eventId,
        staffId: staffEvent.event.staffId,
        ...(derivedEventCategory
          ? { mutationCategory: derivedEventCategory }
          : {}),
        ...(hasBinding(request)
          ? eventBinding && eventBinding !== "invalid"
            ? { bindingIdentity: eventBinding }
            : {}
          : {})
      }
    : { state: persistenceState as "missing" | "uncertain" };

  const projectionState =
    projectionRead.status === "unavailable"
      ? "uncertain"
      : projectionRead.status === "uncertain"
        ? "uncertain"
        : projection &&
            projection.identity.lastEventId === request.eventId
          ? "projected"
          : "missing";
  const projectionEvidence =
    projection && projectionState === "projected"
      ? {
          state: "projected" as const,
          ...(projection.operationId !== undefined
            ? { operationId: projection.operationId }
            : {}),
          eventId: projection.identity.lastEventId ?? undefined,
          staffId: projection.identity.staffId,
          ...(projection.mutationCategory !== undefined
            ? { mutationCategory: projection.mutationCategory }
            : derivedEventCategory
              ? { mutationCategory: derivedEventCategory }
              : {}),
          ...(projection.securityRevision !== undefined
            ? { securityRevision: projection.securityRevision }
            : {}),
          ...(hasBinding(request)
            ? projectionBinding && projectionBinding !== "invalid"
              ? { bindingIdentity: projectionBinding }
              : {}
            : {})
        }
      : { state: projectionState as "missing" | "uncertain" };

  const invitationSideEffect = invitationSideEffectFor(
    request.mutationCategory,
    invitationRead,
    request.operationId,
    missingEvidence
  );

  const contractEvaluation = evaluateStaffWriterCoordination(request, {
    securityDecision,
    staffEventsPersistence: persistenceEvidence,
    projection: projectionEvidence,
    invitationSideEffect
  });

  const contradictory =
    duplicateRecords ||
    wrongEvent ||
    wrongProjection ||
    eventCategoryMismatch ||
    bindingMismatch ||
    malformedCurrentBindingOwnership ||
    (!receiptKindSupported && securityReceipt !== undefined) ||
    (receiptKindSupported &&
      !receiptKindApplicable &&
      !receiptKindHistorical) ||
    receiptBinding === "invalid" ||
    eventBinding === "invalid" ||
    projectionBinding === "invalid" ||
    (isObservedBinding(receiptBinding) &&
      hasBinding(request) &&
      (receiptBinding.entraTenantId !==
        request.bindingIdentity.entraTenantId.toLowerCase() ||
        receiptBinding.entraObjectId !==
          request.bindingIdentity.entraObjectId.toLowerCase())) ||
    (isObservedBinding(eventBinding) &&
      hasBinding(request) &&
      (eventBinding.entraTenantId !==
        request.bindingIdentity.entraTenantId.toLowerCase() ||
        eventBinding.entraObjectId !==
          request.bindingIdentity.entraObjectId.toLowerCase())) ||
    (isObservedBinding(projectionBinding) &&
      hasBinding(request) &&
      (projectionBinding.entraTenantId !==
        request.bindingIdentity.entraTenantId.toLowerCase() ||
        projectionBinding.entraObjectId !==
          request.bindingIdentity.entraObjectId.toLowerCase())) ||
    securityReceiptMismatch ||
    (projectionState === "projected" &&
      projection?.identity.lastEventId !== request.eventId);

  if (duplicateRecords) {
    missingEvidence.push("duplicate_or_ambiguous_source_records");
  }
  if (wrongEvent) {
    missingEvidence.push("staff_event.identity_mismatch");
  }
  if (wrongProjection) {
    missingEvidence.push("projection.staffId_mismatch");
  }
  if (eventCategoryMismatch) {
    missingEvidence.push("staff_event.mutationCategory_mismatch");
  }
  if (bindingMismatch) {
    missingEvidence.push("current_binding.owner_or_identity_mismatch");
  }
  if (currentBindingReleased) {
    missingEvidence.push("current_binding.released_historical");
  }
  if (malformedCurrentBindingOwnership) {
    missingEvidence.push("current_binding.ownershipState_malformed");
  }
  if (securityReceiptMismatch) {
    missingEvidence.push("security_receipt.identity_or_revision_mismatch");
  }

  const uniqueMissingEvidence = [...new Set(missingEvidence)];
  const isUnavailable = unavailableSources.length > 0;
  const isUncertain = uncertainSources.length > 0 ||
    contractEvaluation.status === "uncertain";
  const hasMissingSource =
    securityRead.status === "missing" ||
    eventRead.status === "missing" ||
    projectionRead.status === "missing" ||
    hasBinding(request) && bindingRead.status === "missing" ||
    hasBinding(request) &&
      bindingRead.status === "observed" &&
      bindingRead.records.length === 0 ||
    securityRead.status === "observed" &&
      securityRead.records.length === 0 ||
    eventRead.status === "observed" &&
      eventRead.records.length === 0 ||
    projectionRead.status === "observed" &&
      projectionRead.records.length === 0 ||
    projection !== undefined &&
      projection.identity.lastEventId !== request.eventId;
  const missingCorrelation =
    uniqueMissingEvidence.some(field =>
      field.includes("operationId") ||
      field.includes("eventId") ||
      field.includes("mutationCategory") ||
      field.includes("expectedRevision") ||
      field.includes("StaffState") ||
      field.includes("securityRevision")
    );
  const hasOutstandingRequiredEvidence =
    uniqueMissingEvidence.length > 0;

  const status: StaffWriterReconciliationStatus =
    isUnavailable
      ? "unavailable"
      : isUncertain
        ? "uncertain"
        : contradictory
          ? "contradictory"
          : contractEvaluation.status === "rejected"
            ? "rejected"
            : securityReceipt !== undefined && !receiptKindSupported
              ? "contradictory"
              : currentBindingHistorical ||
                  currentBindingReleased ||
                  receiptKindHistorical
                ? "incomplete"
            : hasMissingSource
              ? "missing"
              : missingCorrelation
                ? "incomplete"
                : contractEvaluation.status === "committed" &&
                    !hasOutstandingRequiredEvidence
                  ? "consistent"
                  : contractEvaluation.status === "inconsistent"
                    ? "contradictory"
                    : "incomplete";

  return makeResult(request, contractEvaluation, {
    status,
    missingEvidence: uniqueMissingEvidence,
    unavailableSources,
    uncertainSources,
    diagnostic:
      isUnavailable
        ? "source_unavailable"
        : isUncertain
          ? "acknowledgement_uncertain"
          : securityReceipt !== undefined && !receiptKindSupported
            ? "unsupported_security_receipt_kind"
          : contradictory
            ? "contradictory_records"
            : contractEvaluation.status === "rejected"
              ? "security_decision_rejected"
              : securityReceipt !== undefined && !receiptKindSupported
                ? "unsupported_security_receipt_kind"
                : currentBindingHistorical ||
                    currentBindingReleased ||
                    receiptKindHistorical
                  ? "historical_security_evidence"
                : status === "consistent"
                ? "evidence_correlated"
                : hasMissingSource
                  ? "source_record_missing"
                  : "correlation_fields_not_persisted",
    reconciliationRequired: status !== "consistent",
    manualReviewRequired:
      status === "contradictory" ||
      status === "uncertain" ||
      status === "unavailable" ||
      contractEvaluation.manualInterventionRequired
  });
}
