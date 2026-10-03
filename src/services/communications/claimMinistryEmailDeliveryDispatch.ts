import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";
import { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";
import {
  claimMinistryEmailDeliveryForDispatch,
  MinistryEmailDeliveryClaimError
} from "./claimMinistryEmailDeliveryForDispatch";

export type VersionedMinistryEmailDeliveryClaimRepository = Pick<
  MinistryEmailDeliveriesRepository,
  "readVersionedById" | "claimIfVersion"
>;

export type ClaimMinistryEmailDeliveryDispatchDependencies = {
  repository?: VersionedMinistryEmailDeliveryClaimRepository;
};

export class MinistryEmailDeliveryClaimPersistenceError extends Error {
  constructor(
    readonly code:
      | "DELIVERY_NOT_FOUND"
      | "DELIVERY_DISPATCH_ALREADY_CLAIMED"
      | "DELIVERY_TRANSITION_CONFLICT"
  ) {
    super(code);
    this.name = "MinistryEmailDeliveryClaimPersistenceError";
  }
}

function repositoryFor(
  dependencies: ClaimMinistryEmailDeliveryDispatchDependencies
): VersionedMinistryEmailDeliveryClaimRepository {
  return dependencies.repository ?? new MinistryEmailDeliveriesRepository();
}

function claimOrConflict(
  record: MinistryEmailDeliveryRecord,
  dispatchAttemptId: string,
  claimedAt: string
): MinistryEmailDeliveryRecord {
  try {
    return claimMinistryEmailDeliveryForDispatch(
      record,
      dispatchAttemptId,
      claimedAt
    );
  } catch (error) {
    if (error instanceof MinistryEmailDeliveryClaimError) {
      if (error.code === "ALREADY_CLAIMED") {
        throw new MinistryEmailDeliveryClaimPersistenceError(
          "DELIVERY_DISPATCH_ALREADY_CLAIMED"
        );
      }
      throw new MinistryEmailDeliveryClaimPersistenceError(
        "DELIVERY_TRANSITION_CONFLICT"
      );
    }
    throw error;
  }
}

export async function claimMinistryEmailDeliveryDispatch(
  deliveryId: string,
  dispatchAttemptId: string,
  claimedAt: string,
  dependencies: ClaimMinistryEmailDeliveryDispatchDependencies = {}
): Promise<MinistryEmailDeliveryRecord> {
  const repository = repositoryFor(dependencies);
  const versioned = await repository.readVersionedById(deliveryId);
  if (!versioned) {
    throw new MinistryEmailDeliveryClaimPersistenceError("DELIVERY_NOT_FOUND");
  }
  if (versioned.record.deliveryId !== deliveryId) {
    throw new MinistryEmailDeliveryClaimPersistenceError(
      "DELIVERY_TRANSITION_CONFLICT"
    );
  }

  const claimed = claimOrConflict(
    versioned.record,
    dispatchAttemptId,
    claimedAt
  );
  if (claimed === versioned.record) return versioned.record;

  if (await repository.claimIfVersion(claimed, versioned.version)) return claimed;

  const current = await repository.readVersionedById(deliveryId);
  if (!current) {
    throw new MinistryEmailDeliveryClaimPersistenceError("DELIVERY_NOT_FOUND");
  }

  const replay = claimOrConflict(current.record, dispatchAttemptId, claimedAt);
  if (replay === current.record) return current.record;
  throw new MinistryEmailDeliveryClaimPersistenceError(
    "DELIVERY_TRANSITION_CONFLICT"
  );
}
