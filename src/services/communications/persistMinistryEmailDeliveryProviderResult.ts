import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailProviderResult } from "./ministryEmailDeliveryProvider";
import {
  MinistryEmailDeliveryTransitionError,
  transitionMinistryEmailDeliveryProviderResult
} from "./transitionMinistryEmailDeliveryProviderResult";
import { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";

export type VersionedMinistryEmailDeliveryRepository = Pick<
  MinistryEmailDeliveriesRepository,
  "readVersionedById" | "transitionIfVersion"
>;

export type PersistMinistryEmailDeliveryProviderResultDependencies = {
  repository?: VersionedMinistryEmailDeliveryRepository;
};

export class MinistryEmailDeliveryPersistenceError extends Error {
  constructor(
    readonly code: "DELIVERY_NOT_FOUND" | "DELIVERY_TRANSITION_CONFLICT"
  ) {
    super(code);
    this.name = "MinistryEmailDeliveryPersistenceError";
  }
}

function repositoryFor(
  dependencies: PersistMinistryEmailDeliveryProviderResultDependencies
): VersionedMinistryEmailDeliveryRepository {
  return dependencies.repository ?? new MinistryEmailDeliveriesRepository();
}

function transitionOrConflict(
  record: MinistryEmailDeliveryRecord,
  result: MinistryEmailProviderResult,
  occurredAt: string
): MinistryEmailDeliveryRecord {
  try {
    return transitionMinistryEmailDeliveryProviderResult(record, result, occurredAt);
  } catch (error) {
    if (error instanceof MinistryEmailDeliveryTransitionError) {
      throw new MinistryEmailDeliveryPersistenceError("DELIVERY_TRANSITION_CONFLICT");
    }
    throw error;
  }
}

/**
 * Persists a provider result independently from provider execution. No provider
 * is invoked here: external sends and conditional storage writes cannot form a
 * single atomic operation.
 */
export async function persistMinistryEmailDeliveryProviderResult(
  deliveryId: string,
  result: MinistryEmailProviderResult,
  occurredAt: string,
  dependencies: PersistMinistryEmailDeliveryProviderResultDependencies = {}
): Promise<MinistryEmailDeliveryRecord> {
  const repository = repositoryFor(dependencies);
  const versioned = await repository.readVersionedById(deliveryId);
  if (!versioned) {
    throw new MinistryEmailDeliveryPersistenceError("DELIVERY_NOT_FOUND");
  }
  if (versioned.record.deliveryId !== deliveryId) {
    throw new MinistryEmailDeliveryPersistenceError("DELIVERY_TRANSITION_CONFLICT");
  }

  const transitioned = transitionOrConflict(versioned.record, result, occurredAt);
  if (transitioned === versioned.record) return versioned.record;

  if (await repository.transitionIfVersion(transitioned, versioned.version)) {
    return transitioned;
  }

  const current = await repository.readVersionedById(deliveryId);
  if (!current) {
    throw new MinistryEmailDeliveryPersistenceError("DELIVERY_NOT_FOUND");
  }

  if (current.record.state === "requested") {
    throw new MinistryEmailDeliveryPersistenceError("DELIVERY_TRANSITION_CONFLICT");
  }

  const replay = transitionOrConflict(current.record, result, occurredAt);
  if (replay === current.record) return current.record;
  throw new MinistryEmailDeliveryPersistenceError("DELIVERY_TRANSITION_CONFLICT");
}
