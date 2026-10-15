import type { TableClient } from "@azure/data-tables";
import { isDeepStrictEqual } from "node:util";
import { validateStaffEventAppendIntent } from "../../contracts/staffEventAppendIntent.v1";
import {
  StaffOperationCorrelationPrototypeRepository,
  STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
  STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION,
  STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE,
  STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS,
  staffEventAppendIntentRowKey
} from "../../repositories/staffOperationCorrelationPrototypeRepository";

export type StaffEventAppendEvidenceStatus =
  | "verified_match"
  | "missing"
  | "contradictory"
  | "unavailable"
  | "unclassified";

export type StaffEventAppendEvidenceInspection = Readonly<{
  status: StaffEventAppendEvidenceStatus;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  securityTransactionVerified: false;
  staffEventsAppendVerified: false;
}>;

const safety = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  securityTransactionVerified: false,
  staffEventsAppendVerified: false
} as const;

function result(
  status: StaffEventAppendEvidenceStatus
): StaffEventAppendEvidenceInspection {
  return { status, ...safety };
}

function missing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; code?: unknown };
  return value.statusCode === 404 && value.code !== "TableNotFound";
}

/**
 * Synthetic, read-only, cross-table observation.
 *
 * A verified match means that a separately read StaffEvents record matches
 * the committed append intent. It does NOT establish cross-table atomicity,
 * authorization, successful coordination, or permission to retry.
 *
 * Both tables must be explicitly supplied by the caller. This service never
 * creates a client, writes, dispatches, repairs, or retries.
 */
export async function inspectStaffEventAppendEvidence(
  operationId: string,
  securityTable: TableClient,
  staffEventsTable: TableClient
): Promise<StaffEventAppendEvidenceInspection> {
  const security = new StaffOperationCorrelationPrototypeRepository(
    securityTable
  );

  let inspection;
  try {
    inspection = await security.inspectOperation({ operationId });
  } catch {
    return result("unavailable");
  }

  if (inspection.status === "unavailable") return result("unavailable");
  if (inspection.status === "missing") return result("missing");

  if (
    inspection.status === "contradictory" ||
    inspection.status === "invalid_input" ||
    inspection.appendIntentEvidence === "contradictory"
  ) {
    return result("contradictory");
  }

  const receipt = inspection.receipt;

  if (
    !receipt ||
    inspection.operationEvidence !== "verified" ||
    receipt.appendIntentRequirement !== "required" ||
    inspection.appendIntentEvidence !== "recorded" ||
    inspection.appendObligationEvidence !== "pending"
  ) {
    return result("unclassified");
  }

  const intentKey = staffEventAppendIntentRowKey(operationId);
  let stored: Record<string, unknown>;

  try {
    stored = await securityTable.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      intentKey
    );
  } catch (error) {
    return result(missing(error) ? "contradictory" : "unavailable");
  }

  if (
    stored.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
    stored.rowKey !== intentKey ||
    stored.schemaVersion !== STAFF_EVENT_APPEND_INTENT_RECORD_SCHEMA_VERSION ||
    stored.source !== STAFF_EVENT_APPEND_INTENT_RECORD_SOURCE ||
    stored.operationId !== receipt.operationId ||
    stored.eventId !== receipt.eventId ||
    stored.staffId !== receipt.staffId ||
    stored.mutationCategory !== receipt.mutationCategory ||
    stored.resultingSecurityRevision !== receipt.resultingRevision ||
    typeof stored.intentJson !== "string" ||
    stored.intentJson.length > STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS
  ) {
    return result("contradictory");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.intentJson);
  } catch {
    return result("contradictory");
  }

  const validated = validateStaffEventAppendIntent(parsed, {
    operationId: receipt.operationId,
    eventId: receipt.eventId,
    staffId: receipt.staffId,
    mutationCategory: receipt.mutationCategory,
    resultingSecurityRevision: receipt.resultingRevision
  });

  if (validated.status !== "valid" || !validated.intent) {
    return result("contradictory");
  }

  const { event, correlation } = validated.intent;
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
  ) {
    return result("contradictory");
  }

  // This record is inside the synthetic security transaction, not
  // canonical StaffEvents. Historical operations may lack the record.
  const syntheticKey = `staff-atomic-event-${event.eventId}`;
  let synthetic: Record<string, unknown>;

  try {
    synthetic = await securityTable.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      syntheticKey
    );
  } catch (error) {
    return result(missing(error) ? "unclassified" : "unavailable");
  }

  if (
    synthetic.partitionKey !== STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION ||
    synthetic.rowKey !== syntheticKey ||
    synthetic.schemaVersion !== 1 ||
    synthetic.source !== "staff-atomic-event-in-security-transaction-v1" ||
    synthetic.operationId !== receipt.operationId ||
    synthetic.eventId !== receipt.eventId ||
    synthetic.staffId !== receipt.staffId ||
    synthetic.mutationCategory !== receipt.mutationCategory ||
    synthetic.resultingSecurityRevision !== receipt.resultingRevision ||
    typeof synthetic.eventJson !== "string" ||
    synthetic.eventJson.length > STAFF_EVENT_APPEND_INTENT_RECORD_MAX_JSON_CHARS
  ) {
    return result("contradictory");
  }

  let syntheticEvent: unknown;
  try {
    syntheticEvent = JSON.parse(synthetic.eventJson);
  } catch {
    return result("contradictory");
  }

  if (!isDeepStrictEqual(syntheticEvent, event)) {
    return result("contradictory");
  }
  const eventKey = `${event.occurredAt}__${event.eventId}`;
  let observed: Record<string, unknown>;

  try {
    observed = await staffEventsTable.getEntity<Record<string, unknown>>(
      event.staffId,
      eventKey
    );
  } catch (error) {
    return result(missing(error) ? "missing" : "unavailable");
  }

  if (
    observed.partitionKey !== event.staffId ||
    observed.rowKey !== eventKey ||
    observed.staffId !== event.staffId ||
    observed.eventId !== event.eventId ||
    observed.type !== event.type ||
    observed.occurredAt !== event.occurredAt ||
    observed.actorId !== event.actorId ||
    typeof observed.dataJson !== "string"
  ) {
    return result("contradictory");
  }

  let observedData: unknown;
  try {
    observedData = JSON.parse(observed.dataJson);
  } catch {
    return result("contradictory");
  }

  if (!isDeepStrictEqual(observedData, event.data)) {
    return result("contradictory");
  }

  // These tables do not provide a shared snapshot. Reinspect security
  // evidence after observing StaffEvents and reject visible changes.
  let finalInspection;
  let finalIntent: Record<string, unknown>;
  let finalSynthetic: Record<string, unknown>;
  try {
    finalInspection = await security.inspectOperation({ operationId });
    finalIntent = await securityTable.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      intentKey
    );
    finalSynthetic = await securityTable.getEntity<Record<string, unknown>>(
      STAFF_OPERATION_CORRELATION_PROTOTYPE_PARTITION,
      syntheticKey
    );
  } catch {
    return result("unavailable");
  }

  if (
    finalInspection.status === "unavailable" ||
    finalInspection.appendIntentEvidence === "unavailable"
  ) {
    return result("unavailable");
  }

  if (
    !isDeepStrictEqual(finalInspection, inspection) ||
    !isDeepStrictEqual(finalIntent, stored) ||
    !isDeepStrictEqual(finalSynthetic, synthetic)
  ) {
    return result("contradictory");
  }

  // This is observational equality, never an authorization or retry grant.
  return result("verified_match");
}