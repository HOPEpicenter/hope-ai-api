import type { ReadMinistryEmailDispatchInspectionResultV1 } from "../../contracts/ministryEmailDispatchInspection.v1";
import {
  isMinistryEmailDeliveryProvider
} from "../../domain/communications/ministryEmailDeliveryContracts";
import { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";

export type MinistryEmailDispatchInspectionRepository = Pick<
  MinistryEmailDeliveriesRepository, "getById"
>;

export type ReadMinistryEmailDispatchInspectionDependencies = {
  repository?: MinistryEmailDispatchInspectionRepository;
  now?: () => string;
};

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/**
 * Read-only and independent of send flags so investigation remains possible
 * during a shutdown. This internal reader is not an authorization boundary.
 * Explicit projection excludes recipient, subject, body and raw failure text.
 */
export async function readMinistryEmailDispatchInspection(
  deliveryId: string,
  dependencies: ReadMinistryEmailDispatchInspectionDependencies = {}
): Promise<ReadMinistryEmailDispatchInspectionResultV1> {
  if (!isText(deliveryId) || deliveryId !== deliveryId.trim()) {
    return { ok: false, code: "INVALID_INSPECTION_INPUT" };
  }

  let inspectedAt: string;
  try {
    inspectedAt = (dependencies.now ?? (() => new Date().toISOString()))();
    if (!isIso(inspectedAt)) {
      return { ok: false, code: "INVALID_INSPECTION_INPUT" };
    }
  } catch {
    return { ok: false, code: "INVALID_INSPECTION_INPUT" };
  }

  let stored: unknown;
  try {
    const repository =
      dependencies.repository ?? new MinistryEmailDeliveriesRepository();
    stored = await repository.getById(deliveryId);
  } catch {
    // Do not expose storage/provider exception messages or embedded content.
    return { ok: false, code: "DELIVERY_INSPECTION_UNAVAILABLE" };
  }
  if (stored === null) return { ok: false, code: "DELIVERY_NOT_FOUND" };
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { ok: false, code: "INVALID_DELIVERY_RECORD" };
  }

  const record = stored as Record<string, unknown>;
  const invalid = (): ReadMinistryEmailDispatchInspectionResultV1 => ({
    ok: false, code: "INVALID_DELIVERY_RECORD"
  });
  if (record.schemaVersion !== 1 || record.channel !== "email" ||
      record.deliveryId !== deliveryId || !isIso(record.requestedAt)) {
    return invalid();
  }

  const state = record.state;
  if (state !== "requested" && state !== "dispatching" &&
      state !== "provider_accepted" && state !== "failed" &&
      state !== "voided") {
    return invalid();
  }

  // Repository reads already normalize legacy missing claim fields to null.
  const attemptId = record.dispatchAttemptId;
  const claimedAt = record.dispatchClaimedAt;
  const cleanProvider = record.provider === null &&
    record.providerMessageId === null && record.providerAcceptedAt === null &&
    record.failedAt === null && record.failureCode === null;

  if (state === "voided") {
    if (attemptId !== null || claimedAt !== null || !cleanProvider ||
        !isIso(record.voidedAt) || !isText(record.voidedBy) ||
        !isText(record.voidReason)) {
      return invalid();
    }
  } else if (state === "requested") {
    if (attemptId !== null || claimedAt !== null || !cleanProvider) {
      return invalid();
    }
  } else {
    if (!isText(attemptId) || !isIso(claimedAt)) return invalid();
    if (state === "dispatching" && !cleanProvider) return invalid();
    if (state === "provider_accepted" &&
        (!isMinistryEmailDeliveryProvider(record.provider) ||
         !isText(record.providerMessageId) ||
         !isIso(record.providerAcceptedAt) || record.failedAt !== null ||
         record.failureCode !== null)) {
      return invalid();
    }
    if (state === "failed" &&
        (!isMinistryEmailDeliveryProvider(record.provider) ||
         !isIso(record.failedAt) ||
         !isText(record.failureCode) || record.providerMessageId !== null ||
         record.providerAcceptedAt !== null)) {
      return invalid();
    }
  }

  // Clock skew/future claims yield unknown age, never a negative age or expiry.
  const elapsed = isIso(claimedAt)
    ? Date.parse(inspectedAt) - Date.parse(claimedAt)
    : null;
  const claimAgeSeconds = elapsed !== null && elapsed >= 0
    ? Math.floor(elapsed / 1000)
    : null;

  return {
    ok: true,
    inspection: {
      deliveryId,
      state,
      inspectedAt,
      requestedAt: record.requestedAt,
      dispatchAttemptId: isText(attemptId) ? attemptId : null,
      dispatchClaimedAt: isIso(claimedAt) ? claimedAt : null,
      claimAgeSeconds,
      provider:
        isMinistryEmailDeliveryProvider(record.provider)
          ? record.provider : null,
      providerMessageId: isText(record.providerMessageId)
        ? record.providerMessageId : null,
      providerAcceptedAt: isIso(record.providerAcceptedAt)
        ? record.providerAcceptedAt : null,
      failedAt: isIso(record.failedAt) ? record.failedAt : null,
      ...(state === "voided" ? { voidedAt: record.voidedAt as string } : {}),
      assessment: state === "requested" ? "not_claimed"
        : state === "dispatching" ? "execution_unresolved" : "terminal_recorded",
      reconciliationRequired: state === "dispatching",
      resendAuthorized: false
    }
  };
}
