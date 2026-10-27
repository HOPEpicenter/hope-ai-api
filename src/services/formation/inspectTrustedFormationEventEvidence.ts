import { types as utilTypes } from "util";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import {
  FormationEventEvidenceReadPort,
  readFormationEventAcquisition
} from "./readFormationEventAcquisition";

const CURRENT_FORMATION_EVENT_STORAGE_MODEL = "current_formation_events_writer_v1";
const TRUST_CONTEXT_KEYS = [
  "storageModel",
  "evidenceInspectionEnabled",
  "staffAuthorized",
  "authorizationEstablishedByTrustedInfrastructure"
] as const;

/**
 * Synthetic trust declarations for structural testing only; these fields are not
 * cryptographic proof or real authorization enforcement. A future production caller
 * must independently establish authorization with canonical staff-identity infrastructure.
 */
export type TrustedFormationEventEvidenceContext = {
  readonly storageModel: string;
  readonly evidenceInspectionEnabled: boolean;
  readonly staffAuthorized: boolean;
  readonly authorizationEstablishedByTrustedInfrastructure: boolean;
};

function assessUnavailableIdentity(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function permitsInspection(context: unknown): context is TrustedFormationEventEvidenceContext {
  try {
    if (
      typeof context !== "object"
      || context === null
      || Array.isArray(context)
      || utilTypes.isProxy(context)
    ) {
      return false;
    }

    const prototype = Object.getPrototypeOf(context);
    if (prototype !== Object.prototype && prototype !== null) return false;

    const keys = Reflect.ownKeys(context);
    if (
      keys.length !== TRUST_CONTEXT_KEYS.length
      || keys.some(key => typeof key !== "string" || !TRUST_CONTEXT_KEYS.some(expected => expected === key))
    ) {
      return false;
    }

    const values: Record<string, unknown> = {};
    for (const key of TRUST_CONTEXT_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(context, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return false;
      values[key] = descriptor.value;
    }

    return values.storageModel === CURRENT_FORMATION_EVENT_STORAGE_MODEL
      && values.evidenceInspectionEnabled === true
      && values.staffAuthorized === true
      && values.authorizationEstablishedByTrustedInfrastructure === true;
  } catch {
    return false;
  }
}

/**
 * Applies a synthetic trusted-context gate, then delegates evidence acquisition to
 * the existing reader. This boundary is not wired to an endpoint or real auth system.
 */
export async function inspectTrustedFormationEventEvidence(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  context: TrustedFormationEventEvidenceContext,
  readPort: FormationEventEvidenceReadPort
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const identityAssessment = assessUnavailableIdentity(identity);
  if (
    identityAssessment.status !== "unavailable"
    || identityAssessment.reasonCode !== "observation_unavailable"
    || identityAssessment.candidateRowKey === null
  ) {
    return identityAssessment;
  }

  if (!permitsInspection(context)) return identityAssessment;

  return readFormationEventAcquisition(identity, readPort);
}
