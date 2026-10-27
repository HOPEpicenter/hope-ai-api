import { types as utilTypes } from "util";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import type { AuthenticatedStaffActionDecision } from "../authorization/authorizeAuthenticatedStaffAction";
import type { FormationEventEvidenceReadPort } from "./readFormationEventAcquisition";
import {
  inspectTrustedFormationEventEvidence
} from "./inspectTrustedFormationEventEvidence";

const CURRENT_FORMATION_EVENT_STORAGE_MODEL = "current_formation_events_writer_v1";
const ALLOWED_DECISION_KEYS = ["allowed", "authenticatedStaffId", "action"] as const;
const DENIED_DECISION_KEYS = ["allowed", "reason"] as const;
const DENIED_REASONS = [
  "unsupported_action",
  "authentication_failed",
  "actor_mismatch",
  "staff_identity_unavailable",
  "staff_binding_mismatch",
  "administrator_configuration_missing",
  "insufficient_authority"
] as const;

/**
 * SYNTHETIC-ONLY, NOT AN AUTHENTICATION BOUNDARY.
 *
 * A plain decision object is ordinary JavaScript data and is not proof of identity.
 * This adapter is for synthetic structural testing only. A future production caller
 * must independently invoke the existing token-verifying, canonical-staff-checking
 * authorization service with trusted server configuration and pass its result through
 * a separately reviewed trusted boundary.
 */
function unavailable(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function isPlainDataObject(value: unknown): value is object {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || utilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotDataProperties(value: object): Record<string, unknown> | undefined {
  try {
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
      }
      Object.defineProperty(snapshot, key, {
        value: descriptor.value,
        enumerable: true,
        configurable: false,
        writable: false
      });
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every(key => typeof key === "string" && expected.some(item => item === key));
}

function isAcceptedDecision(value: unknown): value is AuthenticatedStaffActionDecision {
  if (!isPlainDataObject(value)) return false;
  const decision = snapshotDataProperties(value);
  if (!decision) return false;

  if (decision.allowed === true) {
    return exactKeys(decision, ALLOWED_DECISION_KEYS)
      && typeof decision.authenticatedStaffId === "string"
      && decision.authenticatedStaffId.length > 0
      && decision.authenticatedStaffId.trim() === decision.authenticatedStaffId
      && decision.action === "system.admin";
  }

  if (decision.allowed === false) {
    return exactKeys(decision, DENIED_DECISION_KEYS)
      && typeof decision.reason === "string"
      && DENIED_REASONS.some(reason => reason === decision.reason);
  }

  return false;
}

function trustedContext() {
  return Object.freeze({
    storageModel: CURRENT_FORMATION_EVENT_STORAGE_MODEL,
    evidenceInspectionEnabled: true,
    staffAuthorized: true,
    authorizationEstablishedByTrustedInfrastructure: true
  });
}

export async function inspectFormationEventWithAdminDecision(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  decision: AuthenticatedStaffActionDecision,
  evidenceInspectionEnabled: boolean,
  readPort: FormationEventEvidenceReadPort
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const identityAssessment = unavailable(identity);
  if (
    identityAssessment.status !== "unavailable"
    || identityAssessment.reasonCode !== "observation_unavailable"
    || identityAssessment.candidateRowKey === null
  ) {
    return identityAssessment;
  }

  if (
    evidenceInspectionEnabled !== true
    || !isAcceptedDecision(decision)
    || decision.allowed !== true
  ) {
    return identityAssessment;
  }

  try {
    return await inspectTrustedFormationEventEvidence(
      identity,
      trustedContext(),
      readPort
    );
  } catch {
    return unavailable(identity);
  }
}
