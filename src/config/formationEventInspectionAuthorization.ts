import type { TrustedAdminAuthorizationConfiguration } from "../services/formation/inspectFormationEventWithAuthenticatedAdmin";
import {
  getEntraStaffAuthorizationConfiguration,
  type EntraStaffAuthorizationEnvironment
} from "./entraStaffAuthorization";

export type FormationEventInspectionAuthorizationConfiguration =
  | { readonly evidenceInspectionEnabled: false }
  | {
      readonly evidenceInspectionEnabled: true;
      readonly authorizationConfiguration: TrustedAdminAuthorizationConfiguration;
    };

export class FormationEventInspectionAuthorizationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormationEventInspectionAuthorizationConfigurationError";
  }
}

export const FORMATION_EVENT_INSPECTION_FEATURE_SETTING =
  "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION";

/**
 * Server-side configuration readiness only. The result is NOT proof that any
 * caller is authenticated or authorized, and it activates no endpoint, reader,
 * or storage access. Pass only trusted server environment values; never
 * caller-supplied data. Disabled by default; there is no legacy administrator fallback.
 */
export function getFormationEventInspectionAuthorizationConfiguration(
  environment: EntraStaffAuthorizationEnvironment = process.env
): FormationEventInspectionAuthorizationConfiguration {
  if (typeof environment !== "object" || environment === null) {
    throw new FormationEventInspectionAuthorizationConfigurationError(
      "A trusted environment dictionary is required"
    );
  }

  const rawValue = environment[FORMATION_EVENT_INSPECTION_FEATURE_SETTING];
  if (rawValue !== undefined && typeof rawValue !== "string") {
    throw new FormationEventInspectionAuthorizationConfigurationError(
      `Feature setting must be true or false: ${FORMATION_EVENT_INSPECTION_FEATURE_SETTING}`
    );
  }

  const value = (rawValue ?? "").trim().toLowerCase();
  if (value === "" || value === "false") {
    return Object.freeze({ evidenceInspectionEnabled: false as const });
  }

  if (value !== "true") {
    throw new FormationEventInspectionAuthorizationConfigurationError(
      `Feature setting must be true or false: ${FORMATION_EVENT_INSPECTION_FEATURE_SETTING}`
    );
  }

  // Malformed Entra settings throw from the existing parser and are not caught.
  const entra = getEntraStaffAuthorizationConfiguration(environment);
  const verification = entra.verificationConfiguration;
  const administratorStaffIds = entra.administratorStaffIds;

  if (
    entra.enforcementEnabled !== true
    || !verification
    || !Array.isArray(administratorStaffIds)
    || administratorStaffIds.length === 0
  ) {
    throw new FormationEventInspectionAuthorizationConfigurationError(
      "FormationEvent evidence inspection requires explicitly enabled and valid Entra administrator authorization"
    );
  }

  const permissions = verification.requiredPermissions;
  return Object.freeze({
    evidenceInspectionEnabled: true as const,
    authorizationConfiguration: Object.freeze({
      enforcementEnabled: true as const,
      verificationConfiguration: Object.freeze({
        tenantId: verification.tenantId,
        audience: verification.audience,
        requiredPermissions: Object.freeze({
          ...(permissions.scopes ? { scopes: Object.freeze([...permissions.scopes]) } : {}),
          ...(permissions.roles ? { roles: Object.freeze([...permissions.roles]) } : {})
        }),
        ...(verification.allowedClientApplicationIds
          ? { allowedClientApplicationIds: Object.freeze([...verification.allowedClientApplicationIds]) }
          : {})
      }),
      administratorStaffIds: Object.freeze([...administratorStaffIds])
    })
  });
}
