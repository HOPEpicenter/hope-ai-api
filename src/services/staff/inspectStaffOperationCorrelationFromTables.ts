import type { TableClient } from "@azure/data-tables";
import {
  evaluateStaffOperationCorrelation,
  STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
  type StaffOperationCorrelationBindingEvidence,
  type StaffOperationCorrelationProjectionEvidence,
  type StaffOperationCorrelationRead,
  type StaffOperationCorrelationResult,
  type StaffOperationCorrelationSecurityEvidence,
  type StaffOperationCorrelationSource,
  type StaffOperationCorrelationStaffEventEvidence
} from "../../domain/staff/staffOperationCorrelationContract";
import {
  evaluateStaffWriterCoordination,
  type StaffWriterCoordinationRequest
} from "../../domain/staff/staffWriterCoordinationContract";
import {
  normalizeEntraStaffBinding,
  projectStaffDirectory,
  type StaffEvent,
  type StaffEventType
} from "../../domain/staff/projectStaffDirectory";
import {
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION
} from "../../repositories/staffOperationCorrelationPrototypeRepository";

const securitySource = "staff_security_operation_receipts" as const;
const eventsSource = "staff_events" as const;
const projectionSource = "canonical_staff_projection" as const;
const bindingSource = "staff_binding_ownership" as const;
const securityReceiptSource = "staff-operation-correlation-prototype-v1";
const eventTypes = new Set<StaffEventType>([
  "staff.created",
  "staff.updated",
  "staff.deactivated",
  "staff.invited",
  "staff.activated"
]);

type StaffEventEntity = Readonly<{
  partitionKey: string;
  rowKey: string;
  eventId: string;
  staffId: string;
  type: StaffEventType;
  occurredAt: string;
  actorId: string;
  dataJson: string;
}>;

type SourceState = "observed" | "missing" | "unavailable" | "uncertain";

export type StaffOperationCorrelationTableInspection = Readonly<{
  status: StaffOperationCorrelationResult["status"];
  correlation: StaffOperationCorrelationResult;
  sources: Readonly<{
    securityReceipt: SourceState | "malformed";
    staffEvents: SourceState | "malformed";
    projection: "derived" | "missing" | "unavailable" | "malformed";
    bindingOwnership: SourceState | "malformed" | "not_applicable";
  }>;
  securityReceiptRecordId?: string;
  observedEventIds: readonly string[];
  projectionLastEventId?: string | null;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false
} as const;

function statusCode(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : 0;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function readStatus(error: unknown): "missing" | "unavailable" {
  return statusCode(error) === 404 && errorCode(error) !== "TableNotFound"
    ? "missing"
    : "unavailable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

class MalformedStaffEventEvidence extends Error {}

function decodeStaffEvent(entity: StaffEventEntity): StaffEvent {
  let data: unknown;
  try {
    data = JSON.parse(entity.dataJson);
  } catch {
    throw new MalformedStaffEventEvidence("StaffEvents dataJson is invalid");
  }
  if (
    entity.partitionKey !== entity.staffId ||
    !isIdentifier(entity.eventId) ||
    !isIdentifier(entity.staffId) ||
    typeof entity.occurredAt !== "string" ||
    !entity.occurredAt ||
    typeof entity.actorId !== "string" ||
    !entity.actorId ||
    !eventTypes.has(entity.type) ||
    entity.rowKey !== `${entity.occurredAt}__${entity.eventId}` ||
    !isRecord(data)
  ) {
    throw new MalformedStaffEventEvidence("StaffEvents entity is malformed");
  }
  return {
    eventId: entity.eventId,
    staffId: entity.staffId,
    type: entity.type,
    occurredAt: entity.occurredAt,
    actorId: entity.actorId,
    data
  };
}

function unavailableRead<T>(
  sourceId: StaffOperationCorrelationSource
): StaffOperationCorrelationRead<T> {
  return { status: "unavailable", sourceId };
}

function missingRead<T>(
  sourceId: StaffOperationCorrelationSource
): StaffOperationCorrelationRead<T> {
  return { status: "missing", sourceId };
}

function isStaffState(
  value: unknown
): value is "absent" | "pending" | "active" | "revoked" {
  return value === "absent" ||
    value === "pending" ||
    value === "active" ||
    value === "revoked";
}

function isValidPrototypeReceipt(
  entity: Record<string, unknown>,
  operationRowKey: string
): boolean {
  const hasBindingFields =
    entity.tenantId !== undefined ||
    entity.objectId !== undefined ||
    entity.bindingTransition !== undefined ||
    entity.expectedOwnerStaffId !== undefined;
  const bindingIdentity = hasBindingFields
    ? normalizeEntraStaffBinding(entity.tenantId, entity.objectId)
    : null;

  if (
    entity.schemaVersion !== 1 ||
    entity.source !== securityReceiptSource ||
    entity.rowKey !== operationRowKey ||
    typeof entity.operationId !== "string" ||
    entity.rowKey !== `operation-${entity.operationId}` ||
    typeof entity.eventId !== "string" ||
    typeof entity.staffId !== "string" ||
    typeof entity.mutationCategory !== "string" ||
    !isIdentifier(entity.operationId) ||
    !isIdentifier(entity.eventId) ||
    !isIdentifier(entity.staffId) ||
    !Number.isSafeInteger(entity.expectedRevision) ||
    (entity.expectedRevision as number) < 0 ||
    !Number.isSafeInteger(entity.resultingRevision) ||
    (entity.resultingRevision as number) < 0 ||
    !Number.isSafeInteger((entity.expectedRevision as number) + 1) ||
    entity.resultingRevision !== (entity.expectedRevision as number) + 1 ||
    !isStaffState(entity.previousStaffState) ||
    !isStaffState(entity.resultingStaffState) ||
    entity.outcome !== "committed" ||
    (hasBindingFields && !bindingIdentity) ||
    (bindingIdentity !== null &&
      (entity.tenantId !== bindingIdentity.entraTenantId ||
        entity.objectId !== bindingIdentity.entraObjectId)) ||
    (hasBindingFields &&
      entity.bindingTransition !== "acquire" &&
      entity.bindingTransition !== "release") ||
    (entity.bindingTransition === "release" &&
      (!isIdentifier(entity.expectedOwnerStaffId) ||
        entity.expectedOwnerStaffId !== entity.staffId)) ||
    (entity.bindingTransition === "acquire" &&
      entity.expectedOwnerStaffId !== undefined)
  ) {
    return false;
  }

  const receiptRequest: StaffWriterCoordinationRequest = {
    mutationCategory: entity.mutationCategory,
    operationId: entity.operationId,
    eventId: entity.eventId,
    expectedSecurityRevision: entity.expectedRevision as number,
    expectedStaffId: entity.staffId,
    expectedStaffState: entity.previousStaffState,
    targetStaffState: entity.resultingStaffState,
    bindingIdentity: bindingIdentity
      ? {
          entraTenantId: bindingIdentity.entraTenantId,
          entraObjectId: bindingIdentity.entraObjectId
        }
      : null
  };
  const shapeCheck = evaluateStaffWriterCoordination(receiptRequest, {
    securityDecision: { state: "missing" },
    staffEventsPersistence: { state: "missing" },
    projection: { state: "missing" },
    invitationSideEffect: entity.mutationCategory === "invitation"
      ? "not_started"
      : "not_applicable"
  });
  return shapeCheck.reason !== "unsupported_mutation_category" &&
    shapeCheck.reason !== "invalid_or_contradictory_evidence";
}

function isValidPrototypeBinding(
  entity: Record<string, unknown>,
  binding: Readonly<{ entraTenantId: string; entraObjectId: string }>,
  authorityRevision: number
): boolean {
  const normalized = normalizeEntraStaffBinding(
    entity.tenantId,
    entity.objectId
  );
  if (
    entity.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
    entity.rowKey !== `binding-${binding.entraTenantId}-${binding.entraObjectId}` ||
    !normalized ||
    normalized.entraTenantId !== binding.entraTenantId ||
    normalized.entraObjectId !== binding.entraObjectId ||
    entity.tenantId !== binding.entraTenantId ||
    entity.objectId !== binding.entraObjectId ||
    !isIdentifier(entity.staffId) ||
    !isIdentifier(entity.operationId) ||
    !Number.isSafeInteger(entity.revision) ||
    (entity.revision as number) < 1 ||
    (entity.revision as number) > authorityRevision ||
    typeof entity.etag !== "string" ||
    entity.etag.length === 0 ||
    entity.etag === "*"
  ) {
    return false;
  }

  if (entity.ownershipState === "active") {
    return entity.releasedByStaffId === undefined &&
      entity.releaseOperationId === undefined &&
      entity.releaseRevision === undefined;
  }
  return entity.ownershipState === "released" &&
    isIdentifier(entity.releasedByStaffId) &&
    isIdentifier(entity.releaseOperationId) &&
    Number.isSafeInteger(entity.releaseRevision) &&
    (entity.releaseRevision as number) > (entity.revision as number) &&
    (entity.releaseRevision as number) <= authorityRevision;
}

function malformedResult(
  request: StaffWriterCoordinationRequest,
  sources: StaffOperationCorrelationTableInspection["sources"],
  eventIds: readonly string[],
  receiptId?: string
): StaffOperationCorrelationTableInspection {
  const correlation = evaluateStaffOperationCorrelation({
    schemaVersion: STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
    request,
    securityOperation: { status: "missing", sourceId: eventsSource },
    staffEvent: { status: "missing", sourceId: eventsSource },
    projection: { status: "missing", sourceId: projectionSource },
    bindingOwnership: request.bindingIdentity
      ? { status: "missing", sourceId: bindingSource }
      : { status: "not_applicable" },
    invitationOutcome: request.mutationCategory === "invitation"
      ? { status: "missing", sourceId: "entra_invitation_outcomes" }
      : { status: "not_applicable" }
  });
  return {
    status: "contradictory",
    correlation,
    sources,
    ...(receiptId ? { securityReceiptRecordId: receiptId } : {}),
    observedEventIds: eventIds,
    ...nonAuthorizing
  };
}

/**
 * Reads the synthetic security receipt and StaffEvents independently, derives
 * the canonical identity from the event stream, then applies the existing
 * correlation contract. It never writes, retries, or authorizes an operation.
 */
export async function inspectStaffOperationCorrelationFromTables(
  request: StaffWriterCoordinationRequest,
  securityTable: TableClient,
  staffEventsTable: TableClient
): Promise<StaffOperationCorrelationTableInspection> {
  const operationRowKey = `operation-${request.operationId}`;
  const securityRead = await (async () => {
    try {
      return {
        status: "observed" as const,
        entity: await securityTable.getEntity<Record<string, unknown>>(
          STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
          operationRowKey
        )
      };
    } catch (error) {
      return { status: readStatus(error) } as const;
    }
  })();

  const eventsRead = await (async () => {
    try {
      const events: StaffEvent[] = [];
      for await (const entity of staffEventsTable.listEntities<StaffEventEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${request.expectedStaffId.replace(/'/g, "''")}'`
        }
      })) {
        events.push(decodeStaffEvent(entity));
      }
      return { status: "observed" as const, events };
    } catch (error) {
      return error instanceof MalformedStaffEventEvidence
        ? { status: "malformed" as const }
        : { status: "unavailable" as const };
    }
  })();

  const receiptId = securityRead.status === "observed"
    ? String(securityRead.entity.rowKey ?? "")
    : undefined;
  const eventIds = eventsRead.status === "observed"
    ? eventsRead.events.map(event => event.eventId)
    : [];
  const bindingRequested = request.bindingIdentity !== undefined &&
    request.bindingIdentity !== null;
  const requestedBindingIdentity = bindingRequested
    ? normalizeEntraStaffBinding(
        request.bindingIdentity?.entraTenantId,
        request.bindingIdentity?.entraObjectId
      )
    : null;
  let bindingRead:
    | { status: SourceState; entity?: Record<string, unknown> }
    | { status: "not_applicable" } = { status: "not_applicable" };
  let authorityHead:
    | { status: "observed"; revision: number }
    | { status: "unavailable" }
    | { status: "malformed" }
    | { status: "not_applicable" } = { status: "not_applicable" };

  if (bindingRequested) {
    if (requestedBindingIdentity) {
      const bindingRowKey =
        `binding-${requestedBindingIdentity.entraTenantId}-${requestedBindingIdentity.entraObjectId}`;
      try {
        bindingRead = {
          status: "observed",
          entity: await securityTable.getEntity<Record<string, unknown>>(
            STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
            bindingRowKey
          )
        };
      } catch (error) {
        bindingRead = { status: readStatus(error) };
      }
    } else {
      bindingRead = { status: "missing" };
    }
    try {
      const head = await securityTable.getEntity<Record<string, unknown>>(
        STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
        "ordering-head"
      );
      authorityHead =
        Number.isSafeInteger(head.revision) &&
        (head.revision as number) >= 0 &&
        (head.state === "active" || head.state === "revoked") &&
        typeof head.etag === "string" &&
        head.etag.length > 0 &&
        head.etag !== "*"
          ? { status: "observed", revision: head.revision as number }
          : { status: "malformed" };
    } catch {
      authorityHead = { status: "unavailable" };
    }
  }

  if (
    authorityHead.status === "malformed"
  ) {
    return malformedResult(
      request,
      {
        securityReceipt: securityRead.status,
        staffEvents: eventsRead.status,
        projection: "missing",
        bindingOwnership: "malformed"
      },
      eventIds,
      receiptId
    );
  }
  const sourceStates: StaffOperationCorrelationTableInspection["sources"] = {
    securityReceipt: securityRead.status,
    staffEvents: eventsRead.status,
    projection: eventsRead.status === "malformed"
      ? "malformed"
      : eventsRead.status === "unavailable"
        ? "unavailable"
        : eventsRead.events.length === 0 ||
            projectStaffDirectory(eventsRead.events).every(
              identity => identity.staffId !== request.expectedStaffId
            )
          ? "missing"
          : "derived",
    bindingOwnership:
      authorityHead.status === "unavailable"
        ? "unavailable"
        : bindingRead.status
  };

  if (eventsRead.status === "malformed") {
    return malformedResult(request, sourceStates, eventIds, receiptId);
  }
  if (
    securityRead.status === "observed" &&
    !isValidPrototypeReceipt(securityRead.entity, operationRowKey)
  ) {
    return malformedResult(
      request,
      { ...sourceStates, securityReceipt: "malformed" },
      eventIds,
      receiptId
    );
  }
  if (
    bindingRead.status === "observed" &&
    requestedBindingIdentity &&
    authorityHead.status === "observed" &&
    !isValidPrototypeBinding(
      bindingRead.entity ?? {},
      requestedBindingIdentity,
      authorityHead.revision
    )
  ) {
    return malformedResult(
      request,
      { ...sourceStates, bindingOwnership: "malformed" },
      eventIds,
      receiptId
    );
  }

  const securityOperation: StaffOperationCorrelationRead<
    StaffOperationCorrelationSecurityEvidence
  > = securityRead.status === "observed"
    ? {
        status: "observed",
        sourceId: securitySource,
        records: [{
          recordId: request.operationId,
          persistence: "durable",
          value: {
            kind: securityRead.entity.source === securityReceiptSource &&
                securityRead.entity.schemaVersion === 1
              ? "staff.operation"
              : String(securityRead.entity.source ?? "malformed"),
            verification: securityRead.entity.outcome === "committed"
              ? "verified"
              : "unverified",
            operationId: typeof securityRead.entity.operationId === "string"
              ? securityRead.entity.operationId
              : undefined,
            eventId: typeof securityRead.entity.eventId === "string"
              ? securityRead.entity.eventId
              : undefined,
            staffId: typeof securityRead.entity.staffId === "string"
              ? securityRead.entity.staffId
              : undefined,
            mutationCategory:
              typeof securityRead.entity.mutationCategory === "string"
                ? securityRead.entity.mutationCategory
                : undefined,
            expectedSecurityRevision: Number.isSafeInteger(
              securityRead.entity.expectedRevision
            )
              ? securityRead.entity.expectedRevision as number
              : undefined,
            resultingSecurityRevision: Number.isSafeInteger(
              securityRead.entity.resultingRevision
            )
              ? securityRead.entity.resultingRevision as number
              : undefined,
            outcome: securityRead.entity.outcome === "committed" ||
                securityRead.entity.outcome === "rejected"
              ? securityRead.entity.outcome
              : undefined,
            previousStaffState: isStaffState(
              securityRead.entity.previousStaffState
            )
              ? securityRead.entity.previousStaffState
              : undefined,
            resultingStaffState: isStaffState(
              securityRead.entity.resultingStaffState
            )
              ? securityRead.entity.resultingStaffState
              : undefined,
            bindingIdentity:
              typeof securityRead.entity.tenantId === "string" &&
              typeof securityRead.entity.objectId === "string"
                ? {
                    entraTenantId: securityRead.entity.tenantId,
                    entraObjectId: securityRead.entity.objectId
                  }
                : null
          }
        }]
      }
    : securityRead.status === "missing"
      ? missingRead(securitySource)
      : unavailableRead(securitySource);

  const matchingEvents = eventsRead.status === "observed"
    ? eventsRead.events.filter(event =>
        event.eventId === request.eventId &&
        event.staffId === request.expectedStaffId
      )
    : [];
  const staffEvent: StaffOperationCorrelationRead<
    StaffOperationCorrelationStaffEventEvidence
  > = eventsRead.status === "unavailable"
    ? unavailableRead(eventsSource)
    : matchingEvents.length === 0
      ? missingRead(eventsSource)
      : {
          status: "observed",
          sourceId: eventsSource,
          records: matchingEvents.map(event => ({
            recordId: event.eventId,
            persistence: "durable" as const,
            value: { event }
          }))
        };

  let projection:
    StaffOperationCorrelationRead<StaffOperationCorrelationProjectionEvidence>;
  let projectionLastEventId: string | null | undefined;
  if (eventsRead.status === "unavailable") {
    projection = unavailableRead(projectionSource);
  } else {
    const identity = eventsRead.status === "observed"
      ? projectStaffDirectory(eventsRead.events).find(
          item => item.staffId === request.expectedStaffId
        )
      : undefined;
    projectionLastEventId = identity?.lastEventId;
    projection = missingRead(projectionSource);
  }

  let bindingOwnership:
    | StaffOperationCorrelationRead<StaffOperationCorrelationBindingEvidence>
    | Readonly<{ status: "not_applicable" }>;
  if (bindingRead.status === "not_applicable") {
    bindingOwnership = { status: "not_applicable" };
  } else if (authorityHead.status === "unavailable") {
    bindingOwnership = unavailableRead(bindingSource);
  } else if (bindingRead.status === "missing") {
    bindingOwnership = missingRead(bindingSource);
  } else if (bindingRead.status === "unavailable") {
    bindingOwnership = unavailableRead(bindingSource);
  } else {
    const entity = bindingRead.entity ?? {};
    const normalized = normalizeEntraStaffBinding(
      entity.tenantId,
      entity.objectId
    );
    const value: StaffOperationCorrelationBindingEvidence = {
      staffId: typeof entity.staffId === "string" ? entity.staffId : undefined,
      tenantId: normalized?.entraTenantId,
      objectId: normalized?.entraObjectId,
      operationId: typeof entity.operationId === "string"
        ? entity.operationId
        : undefined,
      ownershipState: typeof entity.ownershipState === "string"
        ? entity.ownershipState
        : undefined,
      securityRevision: Number.isSafeInteger(entity.revision)
        ? entity.revision as number
        : undefined
    };
    bindingOwnership = {
      status: "observed",
      sourceId: bindingSource,
      records: [{
        recordId: `binding-${normalized?.entraTenantId ?? "malformed"}-${normalized?.entraObjectId ?? "malformed"}`,
        persistence: "durable",
        value
      }]
    };
  }

  const correlation = evaluateStaffOperationCorrelation({
    schemaVersion: STAFF_OPERATION_CORRELATION_SCHEMA_VERSION,
    request,
    securityOperation,
    staffEvent,
    projection,
    bindingOwnership,
    invitationOutcome: { status: "not_applicable" }
  });
  const projectionIsLaterEvent =
    matchingEvents.length === 1 &&
    projectionLastEventId !== undefined &&
    projectionLastEventId !== matchingEvents[0].eventId;

  return {
    status: projectionIsLaterEvent ? "stale_historical" : correlation.status,
    correlation,
    sources: sourceStates,
    ...(securityRead.status === "observed"
      ? { securityReceiptRecordId: receiptId }
      : {}),
    observedEventIds: eventIds,
    ...(projectionLastEventId !== undefined
      ? { projectionLastEventId }
      : {}),
    ...nonAuthorizing
  };
}
