import {
  planBindingReservation
} from "./plan-binding-reservation.mjs";

/**
 * Synthetic insert-only reservation prototype.
 *
 * In-memory only: no Azure SDK, storage connection,
 * network access, filesystem writes, or live Staff data.
 *
 * This is not durable production storage, a Staff writer,
 * an authorization mechanism, or cross-partition atomicity.
 */

function denied(status) {
  return Object.freeze({
    status,
    executionPermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    crossPartitionAtomicityProven: false
  });
}

export class SimulatedBindingReservation {
  #entries = new Map();

  reserve(input, options = {}) {
    const planned = planBindingReservation(input);

    if (!planned.plan) {
      return denied("INVALID_RESERVATION_PLAN");
    }

    const plan = planned.plan;

    if (
      planned.executionPermitted !== false ||
      planned.reservationWritePermitted !== false ||
      planned.staffCreationPermitted !== false ||
      plan.storageIntent !== "CONDITIONAL_CREATE_ONLY"
    ) {
      return denied("UNSAFE_RESERVATION_PLAN");
    }

    const key = `${plan.partitionKey}:${plan.rowKey}`;

    if (this.#entries.has(key)) {
      return denied("ALREADY_RESERVED_OR_REPLAY");
    }

    // Synchronous insert-if-absent simulation only.
    // A later durable implementation must provide
    // equivalent storage-enforced uniqueness.
    this.#entries.set(key, Object.freeze({
      staffId: plan.staffId,
      operationId: plan.operationId
    }));

    if (options.simulateLostAcknowledgment === true) {
      return denied("OUTCOME_UNCERTAIN_STOP_AND_RECONCILE");
    }

    return denied("SIMULATED_RESERVATION_INSERTED");
  }

  inspect(input) {
    const planned = planBindingReservation(input);

    if (!planned.plan) {
      return denied("INVALID_RESERVATION_PLAN");
    }

    const key =
      `${planned.plan.partitionKey}:${planned.plan.rowKey}`;

    const existing = this.#entries.get(key);

    if (!existing) {
      return denied("RESERVATION_NOT_FOUND");
    }

    if (
      existing.staffId !== planned.plan.staffId ||
      existing.operationId !== planned.plan.operationId
    ) {
      return denied("RESERVATION_OWNER_MISMATCH");
    }

    return denied("RESERVATION_FOUND_READ_ONLY");
  }
}