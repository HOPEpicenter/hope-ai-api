import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";
import { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";

export const MINISTRY_EMAIL_DELIVERY_VOID_REASON_MAX_LENGTH = 240;

export type VoidMinistryEmailDeliveryRepository = Pick<
  MinistryEmailDeliveriesRepository,
  "readVersionedById" | "voidIfVersion"
>;

export type VoidMinistryEmailDeliveryInput = {
  deliveryId: unknown;
  actorId: unknown;
  reason: unknown;
};

export type VoidMinistryEmailDeliveryDependencies = {
  repository?: VoidMinistryEmailDeliveryRepository;
  now?: () => string;
};

export type VoidMinistryEmailDeliveryResult =
  | { status: "voided"; deliveryId: string; voidedAt: string }
  | { status: "already_voided"; deliveryId: string; voidedAt: string }
  | {
      status: "invalid_input";
      field: "deliveryId" | "actorId" | "reason";
    }
  | { status: "not_found"; deliveryId: string }
  | { status: "not_voidable"; deliveryId: string }
  | { status: "conflict"; deliveryId: string }
  | { status: "persistence_uncertain"; deliveryId: string };

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isClean(record: MinistryEmailDeliveryRecord): boolean {
  return record.dispatchAttemptId === null &&
    record.dispatchClaimedAt === null &&
    record.provider === null &&
    record.providerMessageId === null &&
    record.providerAcceptedAt === null &&
    record.failedAt === null &&
    record.failureCode === null;
}

/**
 * Canonically quarantines a requested, never-claimed delivery. The original
 * immutable request content is preserved verbatim. No provider call, retry,
 * MinistryCommunicationOutcome or Six-Week mutation happens here.
 */
export async function voidMinistryEmailDelivery(
  input: VoidMinistryEmailDeliveryInput,
  dependencies: VoidMinistryEmailDeliveryDependencies = {}
): Promise<VoidMinistryEmailDeliveryResult> {
  if (!isText(input.deliveryId) || input.deliveryId !== input.deliveryId.trim()) {
    return { status: "invalid_input", field: "deliveryId" };
  }
  if (!isText(input.actorId)) {
    return { status: "invalid_input", field: "actorId" };
  }
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > MINISTRY_EMAIL_DELIVERY_VOID_REASON_MAX_LENGTH) {
    return { status: "invalid_input", field: "reason" };
  }

  const deliveryId = input.deliveryId;
  const repository =
    dependencies.repository ?? new MinistryEmailDeliveriesRepository();

  let current;
  try {
    current = await repository.readVersionedById(deliveryId);
  } catch {
    return { status: "persistence_uncertain", deliveryId };
  }
  if (!current) return { status: "not_found", deliveryId };

  const record = current.record;
  if (record.deliveryId !== deliveryId) {
    return { status: "conflict", deliveryId };
  }

  if (record.state === "voided") {
    if (
      isClean(record) &&
      isIso(record.voidedAt) &&
      isText(record.voidedBy) &&
      isText(record.voidReason)
    ) {
      return { status: "already_voided", deliveryId, voidedAt: record.voidedAt };
    }
    return { status: "not_voidable", deliveryId };
  }
  if (record.state !== "requested" || !isClean(record) ||
      (record.voidedAt ?? null) !== null ||
      (record.voidedBy ?? null) !== null ||
      (record.voidReason ?? null) !== null) {
    return { status: "not_voidable", deliveryId };
  }

  let voidedAt: string;
  try {
    voidedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  } catch {
    return { status: "persistence_uncertain", deliveryId };
  }
  if (!isIso(voidedAt)) return { status: "persistence_uncertain", deliveryId };

  const next: MinistryEmailDeliveryRecord = {
    ...record,
    state: "voided",
    voidedAt,
    voidedBy: input.actorId,
    voidReason: reason
  };

  try {
    // A false result is a stale version or state conflict; never retried here.
    if (!(await repository.voidIfVersion(next, current.version))) {
      return { status: "conflict", deliveryId };
    }
  } catch {
    // The write may have landed; never report success.
    return { status: "persistence_uncertain", deliveryId };
  }
  return { status: "voided", deliveryId, voidedAt };
}
