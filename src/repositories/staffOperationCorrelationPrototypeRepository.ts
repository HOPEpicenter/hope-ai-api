import {
  type TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  STAFF_WRITER_MUTATION_CATEGORIES,
  evaluateStaffWriterCoordination,
  type StaffSecurityState,
  type StaffWriterCoordinationRequest,
  type StaffWriterMutationCategory
} from "../domain/staff/staffWriterCoordinationContract";
import { normalizeEntraStaffBinding } from "../domain/staff/projectStaffDirectory";
import { validateStaffEventAppendIntent } from "../contracts/staffEventAppendIntent.v1";

export const STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION =
  "staff-operation-correlation-prototype-v1";
export const STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW =
  "ordering-head";
export const STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE =
  "staff-operation-correlation-prototype-v1";
export const STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION = 1;
export const STAFF_EVENTS_APPEND_OBLIGATION_SOURCE =
  "staff-events-append-obligation-v1";
export const STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION = 1;
export const STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE =
  "staff-event-append-intent-record-v1";
export const STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION = 1;
// Azure Table string properties hold 64 KiB (32,768 UTF-16 characters) and an
// entity 1 MiB; this persistence cap is deliberately below both.
export const STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS = 16384;

type StoredHead = {
  revision: number;
  state: string;
  etag?: string;
};

type StoredStaffState = {
  staffId: string;
  state: string;
  revision: number;
  lastOperationId: string;
  lastEventId: string;
  etag?: string;
};

type StoredBinding = {
  staffId: string;
  tenantId: string;
  objectId: string;
  operationId: string;
  ownershipState: string;
  revision: number;
  releasedByStaffId?: string;
  releaseOperationId?: string;
  releaseRevision?: number;
  etag?: string;
};

type StoredStaffEventsAppendObligation = {
  partitionKey: string;
  rowKey: string;
  schemaVersion: number;
  source: string;
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: string;
  resultingSecurityRevision: number;
  status: string;
  etag?: string;
};

export type StaffOperationBindingTransition =
  | Readonly<{ kind: "acquire" }>
  | Readonly<{ kind: "release"; expectedOwnerStaffId: string }>;

export type StaffOperationCorrelationPrototypeRequest = Readonly<{
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: StaffWriterMutationCategory | string;
  expectedRevision: number;
  expectedStaffState: StaffSecurityState;
  resultingStaffState: StaffSecurityState;
  bindingIdentity?: Readonly<{
    entraTenantId: string;
    entraObjectId: string;
  }> | null;
  bindingTransition?: StaffOperationBindingTransition;
  /**
   * Optional StaffEvent append intent. Validated by the append-intent contract
   * and persisted create-only; absent means a legacy metadata-only operation.
   */
  appendIntent?: unknown;
}>;

export type StaffOperationCorrelationPrototypeResult = Readonly<{
  status:
    | "committed"
    | "rejected"
    | "conflict"
    | "uncertain"
    | "unavailable"
    | "invalid_input";
  revision?: number;
  reason?:
    | "invalid_input"
    | "stale_revision"
    | "staff_state_conflict"
    | "binding_conflict"
    | "authority_revoked"
    | "transaction_conflict"
    | "storage_unavailable"
    | "uncertain_acknowledgement";
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

export type StaffOperationCorrelationPrototypeInspection = Readonly<{
  status:
    | "incomplete"
    | "historical"
    | "contradictory"
    | "missing"
    | "unavailable"
    | "invalid_input";
  operationEvidence: "verified" | "missing" | "unavailable";
  appendObligationEvidence:
    | "not_observed"
    | "pending"
    | "missing"
    | "contradictory"
    | "unavailable";
  appendIntentEvidence:
    | "not_observed"
    | "recorded"
    | "not_recorded"
    | "legacy_unclassified"
    | "not_required"
    | "contradictory"
    | "unavailable";
  currentBindingEvidence:
    | "current"
    | "released"
    | "reassigned"
    | "missing"
    | "not_applicable"
    | "unavailable";
  staffEventEvidence: "not_independently_read";
  projectionEvidence: "not_persisted";
  receipt?: Readonly<{
    schemaVersion: number;
    source: string;
    operationId: string;
    eventId: string;
    staffId: string;
    mutationCategory: StaffWriterMutationCategory;
    expectedRevision: number;
    resultingRevision: number;
    previousStaffState: StaffSecurityState;
    resultingStaffState: StaffSecurityState;
    bindingIdentity: Readonly<{
      entraTenantId: string;
      entraObjectId: string;
    }> | null;
    bindingTransition: "acquire" | "release" | null;
    expectedOwnerStaffId?: string;
    appendIntentRequirement?: "required" | "not_required";
  }>;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

type NormalizedBinding = Readonly<{
  entraTenantId: string;
  entraObjectId: string;
}>;

type ParsedRequest = Readonly<{
  operationId: string;
  eventId: string;
  staffId: string;
  mutationCategory: StaffWriterMutationCategory;
  expectedRevision: number;
  expectedStaffState: StaffSecurityState;
  resultingStaffState: StaffSecurityState;
  bindingIdentity: NormalizedBinding | null;
  bindingTransition: StaffOperationBindingTransition | null;
}>;

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false
} as const;

const categories = new Set<string>(STAFF_WRITER_MUTATION_CATEGORIES);
const identifiers = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const states = new Set<string>(["absent", "pending", "active", "revoked"]);

function rowKey(prefix: string, value: string): string {
  return `${prefix}-${value}`;
}

function bindingRowKey(binding: NormalizedBinding): string {
  return `binding-${binding.entraTenantId}-${binding.entraObjectId}`;
}

export function staffEventsAppendObligationRowKey(
  operationId: string
): string {
  return rowKey("staff-events-append-obligation", operationId);
}

export function staffEventAppendIntentRowKey(operationId: string): string {
  return rowKey("staff-event-append-intent", operationId);
}

type PreparedIntent = Readonly<{ intentJson: string; eventJson: string }>;

// Validates the intent against this proposed transition before any I/O.
function prepareIntent(
  value: unknown,
  parsed: ParsedRequest
): PreparedIntent | null {
  const checked = validateStaffEventAppendIntent(value, {
    operationId: parsed.operationId,
    eventId: parsed.eventId,
    staffId: parsed.staffId,
    mutationCategory: parsed.mutationCategory,
    resultingSecurityRevision: parsed.expectedRevision + 1
  });
  const intent = checked.status === "valid" ? checked.intent : undefined;
  if (!intent) return null;
  const c = intent.correlation;
  const binding = c.binding;
  if (
    c.expectedSecurityRevision !== parsed.expectedRevision ||
    c.previousStaffState !== parsed.expectedStaffState ||
    c.resultingStaffState !== parsed.resultingStaffState ||
    (binding === undefined) !== (parsed.bindingIdentity === null) ||
    (binding !== undefined && (
      binding.identity.entraTenantId !== parsed.bindingIdentity?.entraTenantId ||
      binding.identity.entraObjectId !== parsed.bindingIdentity?.entraObjectId ||
      binding.transition !== parsed.bindingTransition?.kind ||
      binding.expectedOwnerStaffId !==
        (parsed.bindingTransition?.kind === "release"
          ? parsed.bindingTransition.expectedOwnerStaffId
          : undefined)
    ))
  ) {
    return null;
  }
  const intentJson = JSON.stringify(intent);
  const eventJson = JSON.stringify(intent.event);
  return intentJson.length > STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS
    ? null
    : { intentJson, eventJson };
}

function statusCode(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : 0;
}

function validEtag(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "*";
}

function isSecurityState(value: unknown): value is StaffSecurityState {
  return typeof value === "string" && states.has(value);
}

function normalizedStaffId(value: unknown): string | null {
  return typeof value === "string" && identifiers.test(value)
    ? value
    : null;
}

function parseRequest(
  request: StaffOperationCorrelationPrototypeRequest
): ParsedRequest | null {
  if (
    !request ||
    !identifiers.test(request.operationId) ||
    !identifiers.test(request.eventId) ||
    !normalizedStaffId(request.staffId) ||
    typeof request.mutationCategory !== "string" ||
    !categories.has(request.mutationCategory) ||
    !Number.isSafeInteger(request.expectedRevision) ||
    request.expectedRevision < 0 ||
    !isSecurityState(request.expectedStaffState) ||
    !isSecurityState(request.resultingStaffState)
  ) {
    return null;
  }

  const bindingIdentity = request.bindingIdentity === undefined ||
      request.bindingIdentity === null
    ? null
    : normalizeEntraStaffBinding(
        request.bindingIdentity.entraTenantId,
        request.bindingIdentity.entraObjectId
      );
  if (
    request.bindingIdentity !== undefined &&
    request.bindingIdentity !== null &&
    bindingIdentity === null
  ) {
    return null;
  }

  const contractRequest: StaffWriterCoordinationRequest = {
    mutationCategory: request.mutationCategory,
    operationId: request.operationId,
    eventId: request.eventId,
    expectedSecurityRevision: request.expectedRevision,
    expectedStaffId: request.staffId,
    expectedStaffState: request.expectedStaffState,
    targetStaffState: request.resultingStaffState,
    bindingIdentity: bindingIdentity
      ? {
          entraTenantId: bindingIdentity.entraTenantId,
          entraObjectId: bindingIdentity.entraObjectId
        }
      : null
  };
  const shapeCheck = evaluateStaffWriterCoordination(contractRequest, {
    securityDecision: { state: "missing" },
    staffEventsPersistence: { state: "missing" },
    projection: { state: "missing" },
    invitationSideEffect: request.mutationCategory === "invitation"
      ? "not_started"
      : "not_applicable"
  });
  if (
    shapeCheck.reason === "unsupported_mutation_category" ||
    shapeCheck.reason === "invalid_or_contradictory_evidence"
  ) {
    return null;
  }

  const bindingTransition = request.bindingTransition ?? null;
  if (
    (bindingIdentity === null) !== (bindingTransition === null) ||
    (bindingTransition?.kind === "release" &&
      (!normalizedStaffId(bindingTransition.expectedOwnerStaffId) ||
        bindingTransition.expectedOwnerStaffId !== request.staffId)) ||
    (bindingTransition !== null &&
      bindingTransition.kind !== "acquire" &&
      bindingTransition.kind !== "release")
  ) {
    return null;
  }

  return {
    operationId: request.operationId,
    eventId: request.eventId,
    staffId: request.staffId,
    mutationCategory: request.mutationCategory as StaffWriterMutationCategory,
    expectedRevision: request.expectedRevision,
    expectedStaffState: request.expectedStaffState,
    resultingStaffState: request.resultingStaffState,
    bindingIdentity,
    bindingTransition
  };
}

function validHead(head: StoredHead): boolean {
  return Number.isSafeInteger(head.revision) &&
    head.revision >= 0 &&
    (head.state === "active" || head.state === "revoked") &&
    validEtag(head.etag);
}

function validStaffState(
  value: StoredStaffState,
  staffId: string,
  headRevision: number
): boolean {
  return value.staffId === staffId &&
    isSecurityState(value.state) &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    value.revision <= headRevision &&
    identifiers.test(value.lastOperationId) &&
    identifiers.test(value.lastEventId) &&
    validEtag(value.etag);
}

function validBinding(
  value: StoredBinding,
  binding: NormalizedBinding,
  headRevision: number
): boolean {
  const normalized = normalizeEntraStaffBinding(
    value.tenantId,
    value.objectId
  );
  const ownerId = normalizedStaffId(value.staffId);
  if (
    !normalized ||
    normalized.entraTenantId !== binding.entraTenantId ||
    normalized.entraObjectId !== binding.entraObjectId ||
    value.tenantId !== binding.entraTenantId ||
    value.objectId !== binding.entraObjectId ||
    !ownerId ||
    !identifiers.test(value.operationId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    value.revision > headRevision ||
    !validEtag(value.etag)
  ) {
    return false;
  }
  if (value.ownershipState === "active") {
    return value.releasedByStaffId === undefined &&
      value.releaseOperationId === undefined &&
      value.releaseRevision === undefined;
  }
  return value.ownershipState === "released" &&
    normalizedStaffId(value.releasedByStaffId) !== null &&
    identifiers.test(value.releaseOperationId ?? "") &&
    Number.isSafeInteger(value.releaseRevision) &&
    (value.releaseRevision ?? 0) > value.revision &&
    (value.releaseRevision ?? Number.MAX_SAFE_INTEGER) <= headRevision;
}

function result(
  status: StaffOperationCorrelationPrototypeResult["status"],
  reason?: StaffOperationCorrelationPrototypeResult["reason"],
  revision?: number
): StaffOperationCorrelationPrototypeResult {
  return {
    status,
    ...(reason ? { reason } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...nonAuthorizing
  };
}

function unavailableResult(
  reason: "storage_unavailable" = "storage_unavailable"
): StaffOperationCorrelationPrototypeResult {
  return result("unavailable", reason);
}

function invalidInspection(): StaffOperationCorrelationPrototypeInspection {
  return {
    status: "invalid_input",
    operationEvidence: "missing",
    appendObligationEvidence: "not_observed",
    appendIntentEvidence: "not_observed",
    currentBindingEvidence: "not_applicable",
    staffEventEvidence: "not_independently_read",
    projectionEvidence: "not_persisted",
    ...nonAuthorizing
  };
}

export class StaffOperationCorrelationPrototypeRepository {
  constructor(private readonly table: TableClient) {}

  /**
   * Creates only the synthetic authority head. It never initializes a missing
   * head implicitly during an operation transition.
   */
  async initializeAuthorityHead(): Promise<
    "initialized" | "conflict" | "unavailable"
  > {
    try {
      await this.table.createEntity({
        partitionKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
        revision: 0,
        state: "active"
      });
      return "initialized";
    } catch (error) {
      return statusCode(error) === 409 ? "conflict" : "unavailable";
    }
  }

  async commitOperation(
    request: StaffOperationCorrelationPrototypeRequest
  ): Promise<StaffOperationCorrelationPrototypeResult> {
    const parsed = parseRequest(request);
    if (!parsed) return result("invalid_input", "invalid_input");
    // Omitted intent is legacy; an own property explicitly set to undefined is invalid.
    const hasIntent = Object.prototype.hasOwnProperty.call(request, "appendIntent");
    const intent = hasIntent ? prepareIntent(request.appendIntent, parsed) : null;
    if (hasIntent && !intent) {
      return result("invalid_input", "invalid_input");
    }

    const partitionKey = STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION;
    let head: StoredHead;
    try {
      head = await this.table.getEntity<StoredHead>(
        partitionKey,
        STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
      );
    } catch {
      return unavailableResult();
    }
    if (!validHead(head)) return unavailableResult();
    if (head.state !== "active") {
      return result("rejected", "authority_revoked");
    }
    if (head.revision !== parsed.expectedRevision) {
      return result("rejected", "stale_revision");
    }
    if (head.revision === Number.MAX_SAFE_INTEGER) {
      return unavailableResult();
    }

    const staffKey = rowKey("staff", parsed.staffId);
    let existingStaff: StoredStaffState | null = null;
    try {
      existingStaff = await this.table.getEntity<StoredStaffState>(
        partitionKey,
        staffKey
      );
    } catch (error) {
      if (statusCode(error) !== 404) return unavailableResult();
    }

    if (existingStaff) {
      if (!validStaffState(
        existingStaff,
        parsed.staffId,
        Number.MAX_SAFE_INTEGER
      )) {
        return unavailableResult();
      }
      if (existingStaff.revision > head.revision) {
        return result("rejected", "stale_revision");
      }
      if (existingStaff.state !== parsed.expectedStaffState) {
        return result("rejected", "staff_state_conflict");
      }
    } else if (parsed.expectedStaffState !== "absent") {
      return result("rejected", "staff_state_conflict");
    }

    const nextRevision = head.revision + 1;
    const actions: TransactionAction[] = [[
      "update",
      {
        partitionKey,
        rowKey: STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW,
        revision: nextRevision,
        state: head.state
      },
      "Replace",
      { etag: head.etag }
    ]];

    const staffEntity = {
      partitionKey,
      rowKey: staffKey,
      staffId: parsed.staffId,
      state: parsed.resultingStaffState,
      revision: nextRevision,
      lastOperationId: parsed.operationId,
      lastEventId: parsed.eventId
    };
    if (existingStaff) {
      actions.push([
        "update",
        staffEntity,
        "Replace",
        { etag: existingStaff.etag }
      ]);
    } else {
      actions.push(["create", staffEntity]);
    }

    if (parsed.bindingIdentity && parsed.bindingTransition) {
      const bindingKey = bindingRowKey(parsed.bindingIdentity);
      let existingBinding: StoredBinding | null = null;
      try {
        existingBinding = await this.table.getEntity<StoredBinding>(
          partitionKey,
          bindingKey
        );
      } catch (error) {
        if (statusCode(error) !== 404) return unavailableResult();
      }

      if (existingBinding &&
          !validBinding(
            existingBinding,
            parsed.bindingIdentity,
            Number.MAX_SAFE_INTEGER
          )) {
        return unavailableResult();
      }
      if (
        existingBinding &&
        (existingBinding.revision > head.revision ||
          (existingBinding.releaseRevision ?? 0) > head.revision)
      ) {
        return result("rejected", "stale_revision");
      }

      if (parsed.bindingTransition.kind === "acquire") {
        if (existingBinding?.ownershipState === "active") {
          return result("rejected", "binding_conflict");
        }
        const bindingEntity = {
          partitionKey,
          rowKey: bindingKey,
          staffId: parsed.staffId,
          tenantId: parsed.bindingIdentity.entraTenantId,
          objectId: parsed.bindingIdentity.entraObjectId,
          operationId: parsed.operationId,
          ownershipState: "active",
          revision: nextRevision
        };
        if (existingBinding) {
          actions.push([
            "update",
            bindingEntity,
            "Replace",
            { etag: existingBinding.etag }
          ]);
        } else {
          actions.push(["create", bindingEntity]);
        }
      } else {
        if (
          !existingBinding ||
          existingBinding.ownershipState !== "active" ||
          existingBinding.staffId !==
            parsed.bindingTransition.expectedOwnerStaffId
        ) {
          return result("rejected", "binding_conflict");
        }
        actions.push([
          "update",
          {
            partitionKey,
            rowKey: bindingKey,
            staffId: existingBinding.staffId,
            tenantId: parsed.bindingIdentity.entraTenantId,
            objectId: parsed.bindingIdentity.entraObjectId,
            operationId: existingBinding.operationId,
            ownershipState: "released",
            revision: existingBinding.revision,
            releasedByStaffId: parsed.staffId,
            releaseOperationId: parsed.operationId,
            releaseRevision: nextRevision
          },
          "Replace",
          { etag: existingBinding.etag }
        ]);
      }
    }

    const receipt = {
      partitionKey,
      rowKey: rowKey("operation", parsed.operationId),
      schemaVersion: STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION,
      source: STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE,
      operationId: parsed.operationId,
      eventId: parsed.eventId,
      staffId: parsed.staffId,
      mutationCategory: parsed.mutationCategory,
      expectedRevision: parsed.expectedRevision,
      resultingRevision: nextRevision,
      previousStaffState: parsed.expectedStaffState,
      resultingStaffState: parsed.resultingStaffState,
      ...(parsed.bindingIdentity
        ? {
            tenantId: parsed.bindingIdentity.entraTenantId,
            objectId: parsed.bindingIdentity.entraObjectId,
            bindingTransition: parsed.bindingTransition?.kind,
            ...(parsed.bindingTransition?.kind === "release"
              ? {
                  expectedOwnerStaffId:
                    parsed.bindingTransition.expectedOwnerStaffId
                }
              : {})
          }
        : {}),
      appendIntentRequirement: intent ? "required" : "not_required",
      outcome: "committed"
    };
    actions.push(["create", receipt]);
    actions.push([
      "create",
      {
        partitionKey,
        rowKey: staffEventsAppendObligationRowKey(parsed.operationId),
        schemaVersion: STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION,
        source: STAFF_EVENTS_APPEND_OBLIGATION_SOURCE,
        operationId: parsed.operationId,
        eventId: parsed.eventId,
        staffId: parsed.staffId,
        mutationCategory: parsed.mutationCategory,
        resultingSecurityRevision: nextRevision,
        status: "pending"
      }
    ]);
    if (intent) {
      actions.push([
        "create",
        {
          partitionKey,
          rowKey: `staff-atomic-event-${parsed.eventId}`,
          schemaVersion: 1,
          source: "staff-atomic-event-in-security-transaction-v1",
          operationId: parsed.operationId,
          eventId: parsed.eventId,
          staffId: parsed.staffId,
          mutationCategory: parsed.mutationCategory,
          resultingSecurityRevision: nextRevision,
          eventJson: intent.eventJson
        }
      ]);
    }
    if (intent) {
      actions.push([
        "create",
        {
          partitionKey,
          rowKey: staffEventAppendIntentRowKey(parsed.operationId),
          schemaVersion: STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION,
          source: STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE,
          operationId: parsed.operationId,
          eventId: parsed.eventId,
          staffId: parsed.staffId,
          mutationCategory: parsed.mutationCategory,
          resultingSecurityRevision: nextRevision,
          intentJson: intent.intentJson
        }
      ]);
    }

    try {
      await this.table.submitTransaction(actions);
      return result("committed", undefined, nextRevision);
    } catch (error) {
      const code = statusCode(error);
      if (code === 409 || code === 412) {
        return result("conflict", "transaction_conflict");
      }
      return result("uncertain", "uncertain_acknowledgement");
    }
  }

  /**
   * Reads only the security partition. Since StaffEvents and the canonical
   * projection are not read here, it always reports incomplete correlation
   * unless the security evidence itself is contradictory or historical.
   */
  async inspectOperation(
    identity: Readonly<{
      operationId: string;
      eventId?: string;
      staffId?: string;
    }>
  ): Promise<StaffOperationCorrelationPrototypeInspection> {
    if (
      !identity ||
      !identifiers.test(identity.operationId) ||
      (identity.eventId !== undefined &&
        !identifiers.test(identity.eventId)) ||
      (identity.staffId !== undefined &&
        !normalizedStaffId(identity.staffId))
    ) {
      return invalidInspection();
    }

    const partitionKey = STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION;
    let entity: Record<string, unknown>;
    try {
      entity = await this.table.getEntity(
        partitionKey,
        rowKey("operation", identity.operationId)
      );
    } catch (error) {
      const status = statusCode(error);
      return {
        status: status === 404 ? "missing" : "unavailable",
        operationEvidence: status === 404 ? "missing" : "unavailable",
        appendObligationEvidence: "not_observed",
        appendIntentEvidence: "not_observed",
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        ...nonAuthorizing
      };
    }

    const storedBinding =
      typeof entity.tenantId === "string" &&
      typeof entity.objectId === "string"
        ? normalizeEntraStaffBinding(entity.tenantId, entity.objectId)
        : null;
    const storedTransition = entity.bindingTransition;
    const receipt = {
      schemaVersion: entity.schemaVersion,
      source: entity.source,
      operationId: entity.operationId,
      eventId: entity.eventId,
      staffId: entity.staffId,
      mutationCategory: entity.mutationCategory,
      expectedRevision: entity.expectedRevision,
      resultingRevision: entity.resultingRevision,
      previousStaffState: entity.previousStaffState,
      resultingStaffState: entity.resultingStaffState,
      ...(entity.appendIntentRequirement !== undefined
        ? { appendIntentRequirement: entity.appendIntentRequirement }
        : {}),
      bindingIdentity: storedBinding,
      bindingTransition:
        storedTransition === "acquire" || storedTransition === "release"
          ? storedTransition
          : storedBinding === null
            ? null
            : undefined,
      ...(typeof entity.expectedOwnerStaffId === "string"
        ? { expectedOwnerStaffId: entity.expectedOwnerStaffId }
        : {})
    } as NonNullable<
      StaffOperationCorrelationPrototypeInspection["receipt"]
    >;
    if (
      receipt.schemaVersion !==
        STAFF_OPERATION_CORRELATION_PROTOTYPE_SCHEMA_VERSION ||
      receipt.source !== STAFF_OPERATION_CORRELATION_PROTOTYPE_SOURCE ||
      receipt.operationId !== identity.operationId ||
      entity.rowKey !== rowKey("operation", identity.operationId) ||
      !identifiers.test(receipt.eventId) ||
      !normalizedStaffId(receipt.staffId) ||
      typeof receipt.mutationCategory !== "string" ||
      !categories.has(receipt.mutationCategory) ||
      !Number.isSafeInteger(receipt.expectedRevision) ||
      !Number.isSafeInteger(receipt.resultingRevision) ||
      receipt.resultingRevision !== receipt.expectedRevision + 1 ||
      !isSecurityState(receipt.previousStaffState) ||
      !isSecurityState(receipt.resultingStaffState) ||
      (storedBinding === null &&
        (entity.tenantId !== undefined || entity.objectId !== undefined ||
          entity.bindingTransition !== undefined)) ||
      (storedBinding !== null &&
        storedTransition !== "acquire" &&
        storedTransition !== "release") ||
      (storedTransition === "release" &&
        receipt.expectedOwnerStaffId !== receipt.staffId) ||
      (storedTransition !== "release" &&
        entity.expectedOwnerStaffId !== undefined) ||
      (entity.appendIntentRequirement !== undefined &&
        entity.appendIntentRequirement !== "required" &&
        entity.appendIntentRequirement !== "not_required") ||
      entity.outcome !== "committed"
    ) {
      return {
        status: "contradictory",
        operationEvidence: "verified",
        appendObligationEvidence: "not_observed",
        appendIntentEvidence: "not_observed",
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }

    if (
      (identity.eventId !== undefined &&
        identity.eventId !== receipt.eventId) ||
      (identity.staffId !== undefined &&
        identity.staffId !== receipt.staffId)
    ) {
      return {
        status: "contradictory",
        operationEvidence: "verified",
        appendObligationEvidence: "not_observed",
        appendIntentEvidence: "not_observed",
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }

    let appendObligationEvidence:
      StaffOperationCorrelationPrototypeInspection[
        "appendObligationEvidence"
      ];
    let appendObligation: StoredStaffEventsAppendObligation | undefined;
    try {
      appendObligation =
        await this.table.getEntity<StoredStaffEventsAppendObligation>(
          partitionKey,
          staffEventsAppendObligationRowKey(receipt.operationId)
        );
      appendObligationEvidence = "pending";
    } catch (error) {
      const status = statusCode(error);
      if (status === 404) {
        appendObligationEvidence = "missing";
      } else {
        return {
          status: "unavailable",
          operationEvidence: "verified",
          appendObligationEvidence: "unavailable",
          appendIntentEvidence: "not_observed",
          currentBindingEvidence: "unavailable",
          staffEventEvidence: "not_independently_read",
          projectionEvidence: "not_persisted",
          receipt,
          ...nonAuthorizing
        };
      }
    }
    if (
      appendObligationEvidence === "pending" &&
      (
        !appendObligation ||
        appendObligation.partitionKey !== partitionKey ||
        appendObligation.rowKey !==
          staffEventsAppendObligationRowKey(receipt.operationId) ||
        appendObligation.schemaVersion !==
          STAFF_EVENTS_APPEND_OBLIGATION_SCHEMA_VERSION ||
        appendObligation.source !== STAFF_EVENTS_APPEND_OBLIGATION_SOURCE ||
        appendObligation.operationId !== receipt.operationId ||
        appendObligation.eventId !== receipt.eventId ||
        appendObligation.staffId !== receipt.staffId ||
        appendObligation.mutationCategory !== receipt.mutationCategory ||
        appendObligation.resultingSecurityRevision !==
          receipt.resultingRevision ||
        appendObligation.status !== "pending"
      )
    ) {
      return {
        status: "contradictory",
        operationEvidence: "verified",
        appendObligationEvidence: "contradictory",
        appendIntentEvidence: "not_observed",
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }

    const intentRead = await this.readIntentEvidence(receipt);
    const appendIntentEvidence =
      intentRead === "unavailable" ? "unavailable" :
      receipt.appendIntentRequirement === "required" && intentRead === "not_recorded" ? "contradictory" :
      receipt.appendIntentRequirement === "not_required" && intentRead === "recorded" ? "contradictory" :
      receipt.appendIntentRequirement === "not_required" && intentRead === "not_recorded" ? "not_required" :
      receipt.appendIntentRequirement === undefined && intentRead === "not_recorded" ? "legacy_unclassified" :
      intentRead;
    if (intentRead === "unavailable") {
      return {
        status: "unavailable",
        operationEvidence: "verified",
        appendObligationEvidence,
        appendIntentEvidence,
        currentBindingEvidence: "unavailable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }
    // Receipt expectation and stored intent must agree; malformed intent is inconsistent.
    if (
      appendIntentEvidence === "contradictory" ||
      (intentRead === "recorded" && appendObligationEvidence !== "pending")
    ) {
      return {
        status: "contradictory",
        operationEvidence: "verified",
        appendObligationEvidence,
        appendIntentEvidence: "contradictory",
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }

    let head: StoredHead;
    let staff: StoredStaffState;
    try {
      head = await this.table.getEntity<StoredHead>(
        partitionKey,
        STAFF_OPERATION_CORRELATION_PROTOTYPE_HEAD_ROW
      );
      staff = await this.table.getEntity<StoredStaffState>(
        partitionKey,
        rowKey("staff", receipt.staffId)
      );
    } catch {
      return {
        status: "unavailable",
        operationEvidence: "verified",
        appendObligationEvidence,
        appendIntentEvidence,
        currentBindingEvidence: "unavailable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }
    if (
      !validHead(head) ||
      head.revision < receipt.resultingRevision ||
      !validStaffState(staff, receipt.staffId, head.revision)
    ) {
      return {
        status: "contradictory",
        operationEvidence: "verified",
        appendObligationEvidence,
        appendIntentEvidence,
        currentBindingEvidence: "not_applicable",
        staffEventEvidence: "not_independently_read",
        projectionEvidence: "not_persisted",
        receipt,
        ...nonAuthorizing
      };
    }

    let bindingEvidence:
      StaffOperationCorrelationPrototypeInspection["currentBindingEvidence"] =
      "not_applicable";
    if (receipt.bindingIdentity) {
      let binding: StoredBinding;
      try {
        binding = await this.table.getEntity<StoredBinding>(
          partitionKey,
          bindingRowKey(receipt.bindingIdentity)
        );
      } catch (error) {
        bindingEvidence = statusCode(error) === 404
          ? "missing"
          : "unavailable";
        return {
          status: bindingEvidence === "unavailable"
            ? "unavailable"
            : "historical",
          operationEvidence: "verified",
          appendObligationEvidence,
          appendIntentEvidence,
          currentBindingEvidence: bindingEvidence,
          staffEventEvidence: "not_independently_read",
          projectionEvidence: "not_persisted",
          receipt,
          ...nonAuthorizing
        };
      }
      if (!validBinding(binding, receipt.bindingIdentity, head.revision)) {
        return {
          status: "contradictory",
          operationEvidence: "verified",
          appendObligationEvidence,
          appendIntentEvidence,
          currentBindingEvidence: "unavailable",
          staffEventEvidence: "not_independently_read",
          projectionEvidence: "not_persisted",
          receipt,
          ...nonAuthorizing
        };
      }
      bindingEvidence =
        binding.ownershipState === "released"
          ? "released"
          : binding.staffId === receipt.staffId &&
              binding.operationId === receipt.operationId
            ? "current"
            : "reassigned";
    }

    const historical =
      receipt.bindingTransition === "release" ||
      bindingEvidence === "released" ||
      bindingEvidence === "reassigned" ||
      staff.lastOperationId !== receipt.operationId;
    return {
      status: historical ? "historical" : "incomplete",
      operationEvidence: "verified",
      appendObligationEvidence,
      appendIntentEvidence,
      currentBindingEvidence: bindingEvidence,
      staffEventEvidence: "not_independently_read",
      projectionEvidence: "not_persisted",
      receipt,
      ...nonAuthorizing
    };
  }

  /**
   * Reads the immutable intent row. A recorded intent is only a stored plan:
   * it is never evidence that StaffEvents was appended, and an absent row is
   * a legacy metadata-only operation, not a persistence success or failure.
   */
  private async readIntentEvidence(
    receipt: NonNullable<StaffOperationCorrelationPrototypeInspection["receipt"]>
  ): Promise<"recorded" | "not_recorded" | "contradictory" | "unavailable"> {
    const key = staffEventAppendIntentRowKey(receipt.operationId);
    let entity: Record<string, unknown>;
    try {
      entity = await this.table.getEntity(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        key
      );
    } catch (error) {
      return statusCode(error) === 404 ? "not_recorded" : "unavailable";
    }
    if (
      entity.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
      entity.rowKey !== key ||
      entity.schemaVersion !== STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION ||
      entity.source !== STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE ||
      entity.operationId !== receipt.operationId ||
      entity.eventId !== receipt.eventId ||
      entity.staffId !== receipt.staffId ||
      entity.mutationCategory !== receipt.mutationCategory ||
      entity.resultingSecurityRevision !== receipt.resultingRevision ||
      typeof entity.intentJson !== "string" ||
      entity.intentJson.length > STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS
    ) {
      return "contradictory";
    }
    let stored: unknown;
    try {
      stored = JSON.parse(entity.intentJson);
    } catch {
      return "contradictory";
    }
    const checked = validateStaffEventAppendIntent(stored, {
      operationId: receipt.operationId,
      eventId: receipt.eventId,
      staffId: receipt.staffId,
      mutationCategory: receipt.mutationCategory,
      resultingSecurityRevision: receipt.resultingRevision
    });
    if (checked.status !== "valid" || !checked.intent) return "contradictory";
    const correlation = checked.intent.correlation;
    const binding = correlation.binding;
    if (
      correlation.expectedSecurityRevision !== receipt.expectedRevision ||
      correlation.previousStaffState !== receipt.previousStaffState ||
      correlation.resultingStaffState !== receipt.resultingStaffState ||
      (binding === undefined) !== (receipt.bindingIdentity === null) ||
      (binding !== undefined && (
        binding.identity.entraTenantId !== receipt.bindingIdentity?.entraTenantId ||
        binding.identity.entraObjectId !== receipt.bindingIdentity?.entraObjectId ||
        binding.transition !== receipt.bindingTransition ||
        binding.expectedOwnerStaffId !== receipt.expectedOwnerStaffId
      ))
    ) return "contradictory";
    return "recorded";
  }
}
