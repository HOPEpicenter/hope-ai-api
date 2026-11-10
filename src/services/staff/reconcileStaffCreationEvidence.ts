import {
  normalizeEntraStaffBinding,
  type StaffEvent
} from "../../domain/staff/projectStaffDirectory";
import type {
  BindingReservationRequest,
  ReservationEvidence
} from "../../repositories/oauthStaffSecurityStorageRepository";
import type {
  StaffCreationEvidence
} from "../../repositories/inspectStaffCreationEvidence";

/**
 * Non-authorizing, default-disabled historical reconciliation.
 *
 * Independent sequential reads are not an atomic snapshot.
 * No automatic retries, recovery writes, reservation release,
 * OAuth execution, or production permission is provided.
 */
export interface StaffCreationReconciliationPorts {
  inspectReservation(
    request: BindingReservationRequest
  ): Promise<ReservationEvidence>;

  inspectCanonical(
    event: StaffEvent
  ): Promise<StaffCreationEvidence>;
}

export type StaffCreationReconciliationStatus =
  | "not_evaluated"
  | "invalid_input"
  | "observed_both"
  | "historical_binding"
  | "incomplete_or_unavailable"
  | "conflicting"
  | "uncertain";

export type StaffCreationReconciliationResult = Readonly<{
  status: StaffCreationReconciliationStatus;
  reconciliationRequired: true;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  reservationReleasePermitted: false;
  productionWriterFenced: false;
  productionRolloutPermitted: false;
}>;

function result(
  status: StaffCreationReconciliationStatus
): StaffCreationReconciliationResult {
  return Object.freeze({
    status,
    reconciliationRequired: true,
    authoritative: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    reservationReleasePermitted: false,
    productionWriterFenced: false,
    productionRolloutPermitted: false
  });
}

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

const guid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validate(
  value: unknown,
  operationId: unknown
): {
  event: StaffEvent;
  reservation: BindingReservationRequest;
} | null {
  try {
    const event = record(value);
    const data = record(event?.data);

    if (!event || !data ||
        event.type !== "staff.created" ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId) ||
        typeof event.occurredAt !== "string" ||
        event.occurredAt.length > 64 ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        new Date(event.occurredAt).toISOString() !== event.occurredAt ||
        data.status !== "active" ||
        typeof data.displayName !== "string" ||
        !data.displayName.trim() ||
        data.displayName !== data.displayName.trim() ||
        Buffer.byteLength(JSON.stringify(data), "utf8") > 16384 ||
        typeof operationId !== "string" ||
        !guid.test(operationId)) {
      return null;
    }

    const binding = normalizeEntraStaffBinding(
      data.entraTenantId, data.entraObjectId
    );

    if (!binding ||
        binding.entraTenantId !== data.entraTenantId ||
        binding.entraObjectId !== data.entraObjectId) {
      return null;
    }

    return {
      event: event as StaffEvent,
      reservation: {
        tenantId: binding.entraTenantId,
        objectId: binding.entraObjectId,
        staffId: event.staffId,
        operationId
      }
    };
  } catch {
    return null;
  }
}

function reservationStatus(value: unknown):
  ReservationEvidence["status"] | null {
  const found = record(value);
  if (!found ||
      found.executionPermitted !== false ||
      found.retryPermitted !== false) return null;

  switch (found.status) {
    case "observed_consistent":
    case "observed_historical":
    case "absent_or_unavailable":
    case "inconsistent":
      return found.status;
    default:
      return null;
  }
}

function canonicalStatus(value: unknown):
  StaffCreationEvidence["status"] | null {
  const found = record(value);
  if (!found ||
      found.executionPermitted !== false ||
      found.retryPermitted !== false ||
      found.automaticRecoveryPermitted !== false ||
      found.productionWriterFenced !== false ||
      found.authoritative !== false) return null;

  switch (found.status) {
    case "observed_creation":
    case "absent_or_unavailable":
    case "inconsistent":
      return found.status;
    default:
      return null;
  }
}

export async function reconcileStaffCreationEvidence(
  event: unknown,
  operationId: unknown,
  ports: StaffCreationReconciliationPorts,
  prototypeEnabled = false
): Promise<StaffCreationReconciliationResult> {
  if (prototypeEnabled !== true) {
    return result("not_evaluated");
  }

  const checked = validate(event, operationId);

  if (!checked ||
      !ports ||
      typeof ports.inspectReservation !== "function" ||
      typeof ports.inspectCanonical !== "function") {
    return result("invalid_input");
  }

  // Perform independent evidence reads. Neither reader may
  // supply authority, and no result causes a storage write.
  let binding: unknown;
  let canonical: unknown;

  try {
    binding = await ports.inspectReservation(checked.reservation);
  } catch {
    binding = null;
  }

  try {
    canonical = await ports.inspectCanonical(checked.event);
  } catch {
    canonical = null;
  }

  const b = reservationStatus(binding);
  const c = canonicalStatus(canonical);

  if (!b || !c) return result("uncertain");

  if (b === "inconsistent" || c === "inconsistent") {
    return result("conflicting");
  }

  if (b === "absent_or_unavailable" ||
      c === "absent_or_unavailable") {
    return result("incomplete_or_unavailable");
  }

  if (b === "observed_historical") {
    return result("historical_binding");
  }

  if (b === "observed_consistent" &&
      c === "observed_creation") {
    return result("observed_both");
  }

  return result("uncertain");
}