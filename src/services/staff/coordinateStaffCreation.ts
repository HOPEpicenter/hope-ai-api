import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../../domain/staff/projectStaffDirectory";
import type {
  BindingReservationRequest,
  BindingReservationResult
} from "../../repositories/oauthStaffSecurityStorageRepository";
import type {
  StaffScopedAtomicResult
} from "../../repositories/staffScopedAtomicDeactivation";

/**
 * Isolated cross-partition coordination prototype.
 *
 * A confirmed reservation is evidence, not authorization.
 * Two acknowledged transactions are not a distributed
 * atomic transaction.
 *
 * The result deliberately is NOT StaffScopedAtomicResult:
 * it must not be wired directly into atomicCreation commands.
 *
 * No production ports, Graph calls, retries, reservation
 * releases, OAuth execution, or automatic recovery.
 */
export interface StaffCreationCoordinationPorts {
  reserveBinding(
    request: BindingReservationRequest
  ): Promise<BindingReservationResult>;

  createCanonical(
    event: StaffEvent
  ): Promise<StaffScopedAtomicResult>;
}

export type StaffCreationCoordinationStatus =
  | "denied"
  | "uncertain"
  | "both_acknowledged";

export type StaffCreationCoordinationStage =
  | "not_started"
  | "reservation"
  | "canonical_creation"
  | "both_acknowledged";

export type StaffCreationCoordinationResult = Readonly<{
  status: StaffCreationCoordinationStatus;
  stage: StaffCreationCoordinationStage;
  reconciliationRequired: boolean;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionWriterFenced: false;
  productionRolloutPermitted: false;
}>;

const deniedAuthority = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionWriterFenced: false,
  productionRolloutPermitted: false
} as const;

function result(
  status: StaffCreationCoordinationStatus,
  stage: StaffCreationCoordinationStage,
  reconciliationRequired: boolean
): StaffCreationCoordinationResult {
  return Object.freeze({
    status,
    stage,
    reconciliationRequired,
    ...deniedAuthority
  });
}

function record(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validateRequest(
  value: unknown,
  operationId: unknown
): {
  event: StaffEvent;
  reservation: BindingReservationRequest;
} | null {
  try {
    const event = record(value);
    if (
      !event ||
      event.type !== "staff.created" ||
      !validIdentifier(event.eventId) ||
      !validIdentifier(event.staffId) ||
      !validIdentifier(event.actorId) ||
      typeof event.occurredAt !== "string" ||
      event.occurredAt.length > 64 ||
      !Number.isFinite(Date.parse(event.occurredAt)) ||
      new Date(event.occurredAt).toISOString() !== event.occurredAt
    ) {
      return null;
    }

    const data = record(event.data);
    if (
      !data ||
      data.status !== "active" ||
      typeof data.displayName !== "string" ||
      !data.displayName.trim() ||
      data.displayName !== data.displayName.trim() ||
      Buffer.byteLength(JSON.stringify(data), "utf8") > 16384
    ) {
      return null;
    }

    const binding = normalizeEntraStaffBinding(
      data.entraTenantId,
      data.entraObjectId
    );

    const operation = normalizeEntraStaffBinding(
      operationId,
      operationId
    );

    if (
      !binding ||
      !operation ||
      binding.entraTenantId !== data.entraTenantId ||
      binding.entraObjectId !== data.entraObjectId ||
      operation.entraTenantId !== operationId
    ) {
      return null;
    }

    return {
      event: event as StaffEvent,
      reservation: {
        tenantId: binding.entraTenantId,
        objectId: binding.entraObjectId,
        staffId: event.staffId,
        operationId: operation.entraTenantId
      }
    };
  } catch {
    return null;
  }
}

function validReservationResult(
  value: unknown
): value is BindingReservationResult {
  const decision = record(value);

  return Boolean(
    decision &&
    decision.executionPermitted === false &&
    decision.retryPermitted === false &&
    typeof decision.status === "string" &&
    [
      "committed",
      "invalid_input",
      "conflict",
      "unavailable",
      "uncertain"
    ].includes(decision.status) &&
    (
      decision.status !== "committed" ||
      (
        Number.isSafeInteger(decision.revision) &&
        typeof decision.revision === "number" &&
        decision.revision > 0
      )
    )
  );
}

function validCanonicalResult(
  value: unknown
): value is StaffScopedAtomicResult {
  const decision = record(value);

  return Boolean(
    decision &&
    decision.executionPermitted === false &&
    decision.retryPermitted === false &&
    decision.productionWriterFenced === false &&
    (
      decision.status === "committed" ||
      decision.status === "denied" ||
      decision.status === "uncertain"
    )
  );
}

/**
 * Explicitly enabled only by a trusted isolated test caller.
 *
 * No reservation automatically grants permission to create
 * canonical Staff or to execute OAuth operations.
 *
 * Once a reservation is acknowledged, any subsequent
 * unsuccessful or ambiguous result requires reconciliation.
 *
 * This prototype never retries or releases reservations.
 */
export async function coordinateStaffCreation(
  input: unknown,
  operationId: unknown,
  ports: StaffCreationCoordinationPorts,
  prototypeEnabled = false
): Promise<StaffCreationCoordinationResult> {
  if (prototypeEnabled !== true) {
    return result("denied", "not_started", false);
  }

  const checked = validateRequest(input, operationId);

  if (
    !checked ||
    !ports ||
    typeof ports.reserveBinding !== "function" ||
    typeof ports.createCanonical !== "function"
  ) {
    return result("denied", "not_started", false);
  }

  let reservation: BindingReservationResult;

  try {
    reservation = await ports.reserveBinding(
      checked.reservation
    );
  } catch {
    return result("uncertain", "reservation", true);
  }

  if (!validReservationResult(reservation)) {
    return result("uncertain", "reservation", true);
  }

  if (
    reservation.status === "conflict" ||
    reservation.status === "invalid_input"
  ) {
    return result("denied", "reservation", false);
  }

  if (reservation.status !== "committed") {
    return result("uncertain", "reservation", true);
  }

  // Acknowledged reservation alone is insufficient.
  // No alternate legacy append is permitted here.
  let creation: StaffScopedAtomicResult;

  try {
    creation = await ports.createCanonical(checked.event);
  } catch {
    return result("uncertain", "canonical_creation", true);
  }

  if (!validCanonicalResult(creation)) {
    return result("uncertain", "canonical_creation", true);
  }

  if (creation.status !== "committed") {
    return result("uncertain", "canonical_creation", true);
  }

  // Both calls acknowledged, but cross-partition consistency
  // is not independently verified and no authority is granted.
  return result("both_acknowledged", "both_acknowledged", true);
}