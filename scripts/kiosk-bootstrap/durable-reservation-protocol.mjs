import {
  planBindingReservation
} from "./plan-binding-reservation.mjs";

/**
 * Durable storage protocol descriptor and result classifier.
 *
 * No storage SDK, Azure credentials, network operations,
 * live Staff reads, or writing implementation is included.
 */

function denied(status, extra = {}) {
  return Object.freeze({
    status,
    executionPermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    durableCommitVerified: false,
    crossPartitionAtomicityProven: false,
    ...extra
  });
}

export function buildReservationStorageContract(input) {
  const planned = planBindingReservation(input);

  if (!planned.plan ||
      planned.executionPermitted !== false ||
      planned.reservationWritePermitted !== false) {
    return denied("INVALID_RESERVATION_PLAN", {
      command: null
    });
  }

  const plan = planned.plan;

  const entity = Object.freeze({
    partitionKey: plan.partitionKey,
    rowKey: plan.rowKey,
    staffId: plan.staffId,
    operationId: plan.operationId,
    state: "RESERVED",
    protocolVersion: 1
  });

  return denied("DESIGN_ONLY_EXECUTION_DISABLED", {
    command: Object.freeze({
      intent: "INSERT_IF_ABSENT",
      operation: "createEntity",
      overwritePermitted: false,
      upsertPermitted: false,
      deletePermitted: false,
      automaticRetryPermitted: false,
      onConflict: "STOP_AND_RECONCILE",
      onUnknown: "STOP_AND_RECONCILE",
      entity
    })
  });
}

/**
 * Classify a trusted storage adapter's eventual observation.
 *
 * This function does not perform the storage operation.
 * A claimed successful response is not proof of persistence.
 */
export function classifyReservationWrite(observation) {
  if (!observation || typeof observation !== "object" ||
      Array.isArray(observation)) {
    return denied("WRITE_OUTCOME_UNKNOWN_RECONCILE");
  }

  if (observation.kind === "CONFLICT") {
    return denied("RESERVATION_CONFLICT_RECONCILE");
  }

  if (observation.kind === "CREATED") {
    return denied("CREATE_ACKNOWLEDGED_VERIFY_READ_ONLY");
  }

  return denied("WRITE_OUTCOME_UNKNOWN_RECONCILE");
}

/**
 * Compare a later read-only observation with the
 * expected reservation entity. Never retry a write here.
 */
export function reconcileReservation(contract, observed) {
  const expected = contract?.command?.entity;

  if (!expected ||
      contract.status !== "DESIGN_ONLY_EXECUTION_DISABLED" ||
      contract.command.intent !== "INSERT_IF_ABSENT") {
    return denied("INVALID_EXPECTED_RESERVATION");
  }

  if (!observed || typeof observed !== "object" ||
      Array.isArray(observed)) {
    return denied("READ_OUTCOME_UNKNOWN_RECONCILE");
  }

  if (observed.kind === "NOT_FOUND") {
    return denied("RESERVATION_NOT_FOUND_STOP");
  }

  if (observed.kind !== "FOUND" ||
      !observed.entity ||
      typeof observed.entity !== "object" ||
      Array.isArray(observed.entity)) {
    return denied("READ_OUTCOME_UNKNOWN_RECONCILE");
  }

  const actual = observed.entity;

  for (const field of [
    "partitionKey",
    "rowKey",
    "staffId",
    "operationId",
    "state",
    "protocolVersion"
  ]) {
    if (actual[field] !== expected[field]) {
      return denied("RESERVATION_MISMATCH_STOP");
    }
  }

  return denied("RESERVATION_MATCHES_READ_ONLY");
}