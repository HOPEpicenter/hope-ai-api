import { types as utilTypes } from "util";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import {
  authorizeAuthenticatedStaffAction,
  type AuthenticatedStaffActionDecision,
  type AuthorizeAuthenticatedStaffActionDependencies
} from "../authorization/authorizeAuthenticatedStaffAction";
import type { EntraStaffTokenVerificationConfiguration } from "../authorization/verifyEntraStaffAccessToken";
import type { FormationEventEvidenceReadPort } from "./readFormationEventAcquisition";
import { inspectFormationEventWithAdminDecision } from "./inspectFormationEventWithAdminDecision";

export type TrustedAdminAuthorizationConfiguration = {
  readonly enforcementEnabled: true;
  readonly verificationConfiguration: EntraStaffTokenVerificationConfiguration;
  readonly administratorStaffIds: readonly string[];
};

export type AuthenticatedFormationEventInspectionDependencies = {
  readonly authorize?: typeof authorizeAuthenticatedStaffAction;
  readonly authorizationDependencies?: AuthorizeAuthenticatedStaffActionDependencies;
};

const EMPTY_IDENTITY = Object.freeze({
  visitorId: undefined,
  eventId: undefined,
  occurredAt: undefined
}) as unknown as FormationEventEvidenceAcquisitionIdentityV1;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

/**
 * SYNTHETIC INTEGRATION ONLY — NOT A PRODUCTION TRUST BOUNDARY.
 *
 * Authentication execution is delegated to the existing token-verifying,
 * canonical-staff-checking authorization service. Plain configuration and
 * injected dependencies are still trusted server-side inputs; JavaScript
 * objects and the authorization injection seam are not proof of trust. Never
 * derive them from HTTP request data. Production integration requires separately
 * reviewed trusted server-side configuration and invocation boundaries.
 */
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

function snapshotObject(value: object): Record<string, unknown> | undefined {
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

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every(key => typeof key === "string" && expected.some(item => item === key));
}

function captureIdentity(value: unknown): FormationEventEvidenceAcquisitionIdentityV1 | undefined {
  if (!isPlainDataObject(value)) return undefined;
  const snapshot = snapshotObject(value);
  if (!snapshot || !exactKeys(snapshot, ["visitorId", "eventId", "occurredAt"])) return undefined;
  return snapshot as unknown as FormationEventEvidenceAcquisitionIdentityV1;
}

function validStringList(value: unknown, requireNonempty: boolean): readonly string[] | undefined {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined;
  try {
    if (requireNonempty && value.length === 0) return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== value.length + 1
      || !keys.includes("length")
      || keys.some(key => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))
    ) {
      return undefined;
    }
    const list: string[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || typeof descriptor.value !== "string"
        || descriptor.value.length === 0
        || descriptor.value.trim() !== descriptor.value
      ) {
        return undefined;
      }
      list.push(descriptor.value);
    }
    return list;
  } catch {
    return undefined;
  }
}

function captureAuthorizationConfiguration(
  value: unknown
): TrustedAdminAuthorizationConfiguration | undefined {
  if (!isPlainDataObject(value)) return undefined;
  const config = snapshotObject(value);
  if (
    !config
    || !exactKeys(config, ["enforcementEnabled", "verificationConfiguration", "administratorStaffIds"])
    || config.enforcementEnabled !== true
  ) {
    return undefined;
  }

  const rawVerification = config.verificationConfiguration;
  if (!isPlainDataObject(rawVerification)) return undefined;
  const verification = snapshotObject(rawVerification);
  if (
    !verification
    || !exactKeys(verification, [
      "tenantId",
      "audience",
      "requiredPermissions",
      ...(Object.prototype.hasOwnProperty.call(verification, "allowedClientApplicationIds")
        ? ["allowedClientApplicationIds"]
        : [])
    ])
    || typeof verification.tenantId !== "string"
    || !GUID.test(verification.tenantId)
    || typeof verification.audience !== "string"
    || verification.audience.length === 0
    || verification.audience.trim() !== verification.audience
    || /[\s\u0000-\u001f\u007f]/.test(verification.audience)
  ) {
    return undefined;
  }

  const rawPermissions = verification.requiredPermissions;
  if (!isPlainDataObject(rawPermissions)) return undefined;
  const permissions = snapshotObject(rawPermissions);
  if (
    !permissions
    || !exactKeys(
      permissions,
      [
        ...(Object.prototype.hasOwnProperty.call(permissions, "scopes") ? ["scopes"] : []),
        ...(Object.prototype.hasOwnProperty.call(permissions, "roles") ? ["roles"] : [])
      ]
    )
    || (!Object.prototype.hasOwnProperty.call(permissions, "scopes")
      && !Object.prototype.hasOwnProperty.call(permissions, "roles"))
  ) {
    return undefined;
  }
  const scopes = Object.prototype.hasOwnProperty.call(permissions, "scopes")
    ? validStringList(permissions.scopes, false)
    : [];
  const roles = Object.prototype.hasOwnProperty.call(permissions, "roles")
    ? validStringList(permissions.roles, false)
    : [];
  if (
    !scopes
    || !roles
    || (scopes.length === 0 && roles.length === 0)
    || ![...scopes, ...roles].every(value => PERMISSION.test(value))
  ) {
    return undefined;
  }

  const allowedClientApplicationIds = Object.prototype.hasOwnProperty.call(
    verification,
    "allowedClientApplicationIds"
  )
    ? validStringList(verification.allowedClientApplicationIds, true)
    : undefined;
  if (
    Object.prototype.hasOwnProperty.call(verification, "allowedClientApplicationIds")
    && (!allowedClientApplicationIds || !allowedClientApplicationIds.every(id => GUID.test(id)))
  ) {
    return undefined;
  }

  const administratorStaffIds = validStringList(config.administratorStaffIds, true);
  if (!administratorStaffIds) return undefined;

  const normalizedPermissions: { scopes?: readonly string[]; roles?: readonly string[] } = {};
  if (Object.prototype.hasOwnProperty.call(permissions, "scopes")) {
    normalizedPermissions.scopes = scopes;
  }
  if (Object.prototype.hasOwnProperty.call(permissions, "roles")) {
    normalizedPermissions.roles = roles;
  }

  return {
    enforcementEnabled: true,
    verificationConfiguration: {
      tenantId: verification.tenantId,
      audience: verification.audience,
      requiredPermissions: normalizedPermissions,
      ...(allowedClientApplicationIds ? { allowedClientApplicationIds } : {})
    },
    administratorStaffIds
  };
}

function unavailable(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function captureAuthorizedDecision(value: unknown): AuthenticatedStaffActionDecision | undefined {
  if (!isPlainDataObject(value)) return undefined;
  const decision = snapshotObject(value);
  if (
    !decision
    || !exactKeys(decision, ["allowed", "authenticatedStaffId", "action"])
    || decision.allowed !== true
    || typeof decision.authenticatedStaffId !== "string"
    || decision.authenticatedStaffId.length === 0
    || decision.authenticatedStaffId.trim() !== decision.authenticatedStaffId
    || decision.action !== "system.admin"
  ) {
    return undefined;
  }
  return {
    allowed: true,
    authenticatedStaffId: decision.authenticatedStaffId,
    action: "system.admin"
  };
}

/**
 * Runs authenticated administrator authorization before delegating evidence
 * inspection. The bearer token and staff identity are never included in results.
 */
export async function inspectFormationEventWithAuthenticatedAdmin(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string,
  authorizationConfiguration: TrustedAdminAuthorizationConfiguration,
  evidenceInspectionEnabled: boolean,
  readPort: FormationEventEvidenceReadPort,
  dependencies: AuthenticatedFormationEventInspectionDependencies = {}
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const trustedIdentity = captureIdentity(identity);
  if (!trustedIdentity) return unavailable(EMPTY_IDENTITY);

  const identityAssessment = unavailable(trustedIdentity);
  if (
    identityAssessment.status !== "unavailable"
    || identityAssessment.reasonCode !== "observation_unavailable"
    || identityAssessment.candidateRowKey === null
  ) {
    return identityAssessment;
  }

  if (
    typeof accessToken !== "string"
    || accessToken.length === 0
    || accessToken.trim() !== accessToken
    || evidenceInspectionEnabled !== true
  ) {
    return identityAssessment;
  }

  const configuration = captureAuthorizationConfiguration(authorizationConfiguration);
  if (!configuration) return identityAssessment;

  try {
    const authorization = dependencies.authorize ?? authorizeAuthenticatedStaffAction;
    const rawDecision = await authorization(
      accessToken,
      configuration.verificationConfiguration,
      "system.admin",
      { administratorStaffIds: configuration.administratorStaffIds },
      undefined,
      dependencies.authorizationDependencies
    );
    const decision = captureAuthorizedDecision(rawDecision);
    if (!decision) return identityAssessment;

    return inspectFormationEventWithAdminDecision(
      trustedIdentity,
      decision,
      evidenceInspectionEnabled,
      readPort
    );
  } catch {
    return identityAssessment;
  }
}
