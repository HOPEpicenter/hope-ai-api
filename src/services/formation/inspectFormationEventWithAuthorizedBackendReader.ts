import { types as utilTypes } from "util";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import {
  getFormationEventInspectionAuthorizationConfiguration
} from "../../config/formationEventInspectionAuthorization";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import type {
  AuthenticatedStaffActionDecision
} from "../authorization/authorizeAuthenticatedStaffAction";
import {
  FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY
} from "./createFormationEventReadOnlyCredentialBoundary";

const IDENTITY_KEYS = ["visitorId", "eventId", "occurredAt"] as const;
const COMPACT_BEARER_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const EMPTY_IDENTITY = Object.freeze({
  visitorId: undefined,
  eventId: undefined,
  occurredAt: undefined
}) as unknown as FormationEventEvidenceAcquisitionIdentityV1;

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

function captureIdentity(
  value: unknown
): FormationEventEvidenceAcquisitionIdentityV1 | undefined {
  try {
    if (!isPlainDataObject(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== IDENTITY_KEYS.length
      || keys.some(key => (
        typeof key !== "string"
        || !IDENTITY_KEYS.some(expectedKey => expectedKey === key)
      ))
    ) {
      return undefined;
    }

    const captured: Record<string, unknown> = Object.create(null);
    for (const key of IDENTITY_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || descriptor.enumerable !== true
      ) {
        return undefined;
      }
      captured[key] = descriptor.value;
    }
    return Object.freeze(captured) as unknown as FormationEventEvidenceAcquisitionIdentityV1;
  } catch {
    return undefined;
  }
}

function unavailable(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function isAllowedAdministratorDecision(
  value: unknown
): value is Extract<AuthenticatedStaffActionDecision, { allowed: true }> {
  try {
    if (!isPlainDataObject(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3
      || keys.some(key => !["allowed", "authenticatedStaffId", "action"].includes(String(key)))
    ) {
      return false;
    }
    const allowed = Object.getOwnPropertyDescriptor(value, "allowed");
    const authenticatedStaffId = Object.getOwnPropertyDescriptor(value, "authenticatedStaffId");
    const action = Object.getOwnPropertyDescriptor(value, "action");
    return allowed !== undefined
      && Object.prototype.hasOwnProperty.call(allowed, "value")
      && allowed.value === true
      && authenticatedStaffId !== undefined
      && Object.prototype.hasOwnProperty.call(authenticatedStaffId, "value")
      && typeof authenticatedStaffId.value === "string"
      && authenticatedStaffId.value.length > 0
      && authenticatedStaffId.value.trim() === authenticatedStaffId.value
      && action !== undefined
      && Object.prototype.hasOwnProperty.call(action, "value")
      && action.value === "system.admin";
  } catch {
    return false;
  }
}

/**
 * Authorizes against trusted backend configuration before constructing the
 * FormationEvent V1 reader. No caller-supplied value can establish authority.
 */
export async function inspectFormationEventWithAuthorizedBackendReader(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const trustedIdentity = captureIdentity(identity);
  if (!trustedIdentity) return unavailable(EMPTY_IDENTITY);

  const preflight = unavailable(trustedIdentity);
  if (
    preflight.status !== "unavailable"
    || preflight.reasonCode !== "observation_unavailable"
    || preflight.candidateRowKey === null
  ) {
    return preflight;
  }

  if (!FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY) return preflight;

  let configuration;
  try {
    configuration = getFormationEventInspectionAuthorizationConfiguration();
  } catch {
    return preflight;
  }
  if (
    configuration.evidenceInspectionEnabled !== true
    || configuration.authorizationConfiguration.enforcementEnabled !== true
  ) {
    return preflight;
  }

  if (
    typeof accessToken !== "string"
    || accessToken.length === 0
    || accessToken.trim() !== accessToken
    || !COMPACT_BEARER_TOKEN.test(accessToken)
  ) {
    return preflight;
  }

  let decision: unknown;
  try {
    const { authorizeAuthenticatedStaffAction } = await import(
      "../authorization/authorizeAuthenticatedStaffAction"
    );
    decision = await authorizeAuthenticatedStaffAction(
      accessToken,
      configuration.authorizationConfiguration.verificationConfiguration,
      "system.admin",
      {
        administratorStaffIds:
          configuration.authorizationConfiguration.administratorStaffIds
      }
    );
  } catch {
    return preflight;
  }
  if (!isAllowedAdministratorDecision(decision)) return preflight;

  try {
    const { createFormationEventV1BackendReadPort } = await import(
      "./createFormationEventV1BackendReadPort"
    );
    const readPort = createFormationEventV1BackendReadPort();
    const { readFormationEventAcquisition } = await import(
      "./readFormationEventAcquisition"
    );
    return await readFormationEventAcquisition(trustedIdentity, readPort);
  } catch {
    return preflight;
  }
}
