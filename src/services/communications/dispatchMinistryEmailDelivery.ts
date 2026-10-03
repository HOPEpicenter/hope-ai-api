import { randomUUID } from "node:crypto";
import { getFeatureFlags } from "../../config/featureFlags";
import { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";
import {
  claimMinistryEmailDeliveryDispatch,
  MinistryEmailDeliveryClaimPersistenceError,
  type VersionedMinistryEmailDeliveryClaimRepository
} from "./claimMinistryEmailDeliveryDispatch";
import { executeClaimedMinistryEmailDelivery } from "./executeRequestedMinistryEmailDelivery";
import type {
  MinistryEmailDeliveryProviderAdapter,
  MinistryEmailProviderResult
} from "./ministryEmailDeliveryProvider";
import {
  persistMinistryEmailDeliveryProviderResult,
  MinistryEmailDeliveryPersistenceError,
  type VersionedMinistryEmailDeliveryRepository
} from "./persistMinistryEmailDeliveryProviderResult";

export type MinistryEmailDispatchRepository =
  VersionedMinistryEmailDeliveryClaimRepository &
  VersionedMinistryEmailDeliveryRepository;

export type MinistryEmailDispatchStatus =
  | "phase5_disabled"
  | "provider_sending_disabled"
  | "delivery_not_found"
  | "delivery_read_failed"
  | "already_terminal"
  | "already_dispatching_reconciliation_required"
  | "claim_conflict"
  | "claim_persistence_uncertain"
  | "provider_execution_uncertain"
  | "provider_result_persistence_conflict"
  | "provider_result_persistence_uncertain"
  | "provider_accepted"
  | "provider_failed";

export type MinistryEmailDispatchResult = {
  deliveryId: string;
  status: MinistryEmailDispatchStatus;
  reconciliationRequired: boolean;
};

export type DispatchMinistryEmailDeliveryDependencies = {
  provider: MinistryEmailDeliveryProviderAdapter;
  repository?: MinistryEmailDispatchRepository;
  getFlags?: () => {
    phase5Communications: boolean;
    ministryEmailProviderSending: boolean;
  };
  createDispatchAttemptId?: () => string;
  now?: () => string;
};

/**
 * Internal orchestration only. No endpoint, credentials, retry, claim expiry,
 * or communication/Six-Week mutation. Only a newly acquired durable claim
 * authorizes one provider invocation.
 */
export async function dispatchMinistryEmailDelivery(
  deliveryId: string,
  dependencies: DispatchMinistryEmailDeliveryDependencies
): Promise<MinistryEmailDispatchResult> {
  const outcome = (
    status: MinistryEmailDispatchStatus,
    reconciliationRequired = false
  ): MinistryEmailDispatchResult => ({
    deliveryId, status, reconciliationRequired
  });

  const flags = (dependencies.getFlags ?? getFeatureFlags)();
  if (!flags.phase5Communications) return outcome("phase5_disabled");
  if (!flags.ministryEmailProviderSending) {
    return outcome("provider_sending_disabled");
  }

  const repository =
    dependencies.repository ?? new MinistryEmailDeliveriesRepository();
  let existing;
  try {
    existing = await repository.readVersionedById(deliveryId);
  } catch {
    return outcome("delivery_read_failed");
  }
  if (!existing) return outcome("delivery_not_found");
  if (existing.record.deliveryId !== deliveryId) {
    return outcome("claim_conflict");
  }
  if (existing.record.state === "dispatching") {
    return outcome("already_dispatching_reconciliation_required", true);
  }
  if (existing.record.state === "provider_accepted" ||
      existing.record.state === "failed") {
    return outcome("already_terminal");
  }

  const now = dependencies.now ?? (() => new Date().toISOString());
  let claim;
  try {
    claim = await claimMinistryEmailDeliveryDispatch(
      deliveryId,
      (dependencies.createDispatchAttemptId ?? randomUUID)(),
      now(),
      { repository }
    );
  } catch (error) {
    if (error instanceof MinistryEmailDeliveryClaimPersistenceError) {
      if (error.code === "DELIVERY_NOT_FOUND") {
        return outcome("delivery_not_found");
      }
      if (error.code === "DELIVERY_DISPATCH_ALREADY_CLAIMED") {
        return outcome("already_dispatching_reconciliation_required", true);
      }
      return outcome("claim_conflict");
    }
    // A storage exception may occur after the claim write succeeded.
    return outcome("claim_persistence_uncertain", true);
  }
  if (!claim.acquired) {
    return outcome("already_dispatching_reconciliation_required", true);
  }

  // Keep the provider result separate from the tentative transitioned record.
  const captured: { result?: MinistryEmailProviderResult } = {};
  let occurredAt: string;
  try {
    occurredAt = now();
    await executeClaimedMinistryEmailDelivery(
      claim.delivery,
      {
        send: async request => {
          const result = await dependencies.provider.send(request);
          captured.result = structuredClone(result);
          return result;
        }
      },
      occurredAt
    );
    if (!captured.result) {
      return outcome("provider_execution_uncertain", true);
    }
  } catch {
    // Never turn an uncertain external send into a retry-safe failed record.
    return outcome("provider_execution_uncertain", true);
  }

  try {
    const persisted = await persistMinistryEmailDeliveryProviderResult(
      deliveryId,
      claim.delivery.dispatchAttemptId!,
      captured.result,
      occurredAt,
      { repository }
    );
    return outcome(
      persisted.state === "provider_accepted"
        ? "provider_accepted"
        : "provider_failed"
    );
  } catch (error) {
    return outcome(
      error instanceof MinistryEmailDeliveryPersistenceError
        ? "provider_result_persistence_conflict"
        : "provider_result_persistence_uncertain",
      true
    );
  }
}
