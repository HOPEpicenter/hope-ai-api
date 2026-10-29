import { types as utilTypes } from "util";
import {
  createFormationEventReadOnlyCredentialBoundary
} from "./createFormationEventReadOnlyCredentialBoundary";
import type { FormationEventEvidenceReadPort } from "./readFormationEventAcquisition";

type SyntheticGetEntity = (
  partitionKey: string,
  rowKey: string
) => Promise<unknown>;

function isSyntheticGetEntity(value: unknown): value is SyntheticGetEntity {
  return typeof value === "function";
}

function createReadPort(
  getEntity: SyntheticGetEntity,
  receiver: unknown
): FormationEventEvidenceReadPort {
  return Object.freeze({
    getEntity(partitionKey: string, rowKey: string): Promise<unknown> {
      return Reflect.apply(getEntity, receiver, [partitionKey, rowKey]);
    }
  });
}

/**
 * Creates the narrow FormationEvent reader from the dedicated, server-owned
 * managed-identity credential boundary. This adapter grants no authorization.
 */
export function createFormationEventV1BackendReadPort(): FormationEventEvidenceReadPort {
  const readPort = createFormationEventReadOnlyCredentialBoundary();
  return createReadPort(readPort.getEntity, readPort);
}

/**
 * Synthetic-only dependency-injection seam for local tests. An injected client
 * cannot prove production provenance or authorize inspection; never expose this
 * factory to an HTTP caller or use it for production composition.
 */
export function createSyntheticFormationEventV1BackendReadPort(
  createSyntheticClient: unknown
): FormationEventEvidenceReadPort {
  if (typeof createSyntheticClient !== "function") {
    throw new TypeError("A synthetic-only client factory function is required");
  }

  const client: unknown = Reflect.apply(createSyntheticClient, undefined, []);
  if (
    typeof client !== "object"
    || client === null
    || Array.isArray(client)
    || utilTypes.isProxy(client)
    || Object.getPrototypeOf(client) !== Object.prototype
    || Reflect.ownKeys(client).length !== 1
    || Reflect.ownKeys(client)[0] !== "getEntity"
  ) {
    throw new TypeError("A plain synthetic client with only getEntity is required");
  }

  const descriptor = Object.getOwnPropertyDescriptor(client, "getEntity");
  if (
    descriptor === undefined
    || !Object.prototype.hasOwnProperty.call(descriptor, "value")
    || descriptor.enumerable !== true
    || !isSyntheticGetEntity(descriptor.value)
  ) {
    throw new TypeError("The synthetic client's getEntity must be an own data method");
  }

  return createReadPort(descriptor.value, client);
}
