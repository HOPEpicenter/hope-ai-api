import { types as utilTypes } from "util";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionRecordV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";

export type FormationEventEvidenceReadPort = {
  readonly getEntity: (partitionKey: string, rowKey: string) => Promise<unknown>;
};

const ERROR_CONTAINER_KEYS = [
  "details",
  "error",
  "innerError",
  "parsedBody",
  "response",
  "serviceError"
] as const;
const ERROR_CODE_KEYS = ["code", "errorCode"] as const;
const ERROR_STATUS_KEYS = ["status", "statusCode"] as const;
const MAX_ERROR_NODES = 32;

type ErrorFacts = {
  readonly isEntityNotFound: boolean;
  readonly isTableNotFound: boolean;
  readonly hasConflictingCode: boolean;
  readonly statuses: readonly number[];
  readonly safeToClassify: boolean;
};

const INVALID_IDENTITY = {
  visitorId: undefined,
  eventId: undefined,
  occurredAt: undefined
} as unknown as FormationEventEvidenceAcquisitionIdentityV1;

function assessAvailability(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  availability: "absent_observed" | "unavailable"
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function captureTrustedIdentity(value: unknown): FormationEventEvidenceAcquisitionIdentityV1 | undefined {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || utilTypes.isProxy(value)
    ) {
      return undefined;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const captured = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return undefined;
      Object.defineProperty(captured, key, {
        value: Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? descriptor.value
          : undefined,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }

    return captured as FormationEventEvidenceAcquisitionIdentityV1;
  } catch {
    return undefined;
  }
}

function readPortMethod(value: unknown): FormationEventEvidenceReadPort["getEntity"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;

  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "getEntity") return undefined;

  const descriptor = Object.getOwnPropertyDescriptor(value, "getEntity");
  if (
    descriptor === undefined
    || !Object.prototype.hasOwnProperty.call(descriptor, "value")
    || typeof descriptor.value !== "function"
  ) {
    return undefined;
  }
  return descriptor.value as FormationEventEvidenceReadPort["getEntity"];
}

function errorFacts(error: unknown): ErrorFacts {
  const queue: unknown[] = [error];
  const visited = new WeakSet<object>();
  let isEntityNotFound = false;
  let isTableNotFound = false;
  let hasConflictingCode = false;
  const statuses = new Set<number>();
  let safeToClassify = true;
  let processed = 0;

  while (queue.length > 0 && processed < MAX_ERROR_NODES) {
    const current = queue.shift();
    if (typeof current !== "object" || current === null || visited.has(current)) continue;
    visited.add(current);
    processed++;

    for (const key of ERROR_CODE_KEYS) {
      const property = readErrorProperty(current, key);
      safeToClassify = safeToClassify && property.safe;
      const code = property.value;
      if (property.present) {
        if (typeof code !== "string" || code.trim().length === 0) {
          safeToClassify = false;
        } else if (code === "EntityNotFound") {
          isEntityNotFound = true;
        } else {
          hasConflictingCode = true;
          if (code === "TableNotFound") isTableNotFound = true;
        }
      }
    }

    for (const key of ERROR_STATUS_KEYS) {
      const property = readErrorProperty(current, key);
      safeToClassify = safeToClassify && property.safe;
      if (property.present) {
        if (
          typeof property.value !== "number"
          || !Number.isInteger(property.value)
          || property.value < 100
          || property.value > 599
        ) {
          safeToClassify = false;
        } else {
          statuses.add(property.value);
        }
      }
    }

    for (const key of ERROR_CONTAINER_KEYS) {
      const property = readErrorProperty(current, key);
      safeToClassify = safeToClassify && property.safe;
      const nested = property.value;
      if (typeof nested === "object" && nested !== null) queue.push(nested);
    }
  }

  if (queue.length > 0) {
    return {
      isEntityNotFound: false,
      isTableNotFound: true,
      hasConflictingCode: true,
      statuses: [],
      safeToClassify: false
    };
  }

  return {
    isEntityNotFound,
    isTableNotFound,
    hasConflictingCode,
    statuses: [...statuses],
    safeToClassify
  };
}

function readErrorProperty(value: object, key: string): { value: unknown; present: boolean; safe: boolean } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { value: undefined, present: false, safe: true };
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return { value: undefined, present: true, safe: false };
  }
  return { value: descriptor.value, present: true, safe: true };
}

function isVerifiedEntityNotFound(error: unknown): boolean {
  try {
    const facts = errorFacts(error);
    return facts.safeToClassify
      && facts.statuses.length > 0
      && facts.statuses.every(status => status === 404)
      && facts.isEntityNotFound
      && !facts.hasConflictingCode
      && !facts.isTableNotFound;
  } catch {
    return false;
  }
}

export async function readFormationEventAcquisition(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  readPort: FormationEventEvidenceReadPort
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const trustedIdentity = captureTrustedIdentity(identity);
  if (!trustedIdentity) return assessAvailability(INVALID_IDENTITY, "unavailable");

  const preflight = assessAvailability(trustedIdentity, "unavailable");
  if (
    preflight.status !== "unavailable"
    || preflight.reasonCode !== "observation_unavailable"
    || preflight.candidateRowKey === null
  ) {
    return preflight;
  }

  try {
    const getEntity = readPortMethod(readPort);
    if (!getEntity) return preflight;
    const entity = await Reflect.apply(getEntity, readPort, [
      trustedIdentity.visitorId,
      preflight.candidateRowKey
    ]);

    return assessFormationEventAcquisition({
      identity: trustedIdentity,
      observation: {
        availability: "available",
        record: entity as FormationEventEvidenceAcquisitionRecordV1
      }
    });
  } catch (error) {
    return assessAvailability(
      trustedIdentity,
      isVerifiedEntityNotFound(error) ? "absent_observed" : "unavailable"
    );
  }
}
