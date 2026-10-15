import {
  assessStaffInvitationActivationBinding,
  type ActivationBindingAssessment
} from "../../domain/staff/staffInvitationActivationBindingAssessment";

import {
  resolveVerifiedPendingStaffIdentity,
  type ResolveVerifiedPendingStaffIdentityDependencies
} from "./resolveVerifiedPendingStaffIdentity";

import type {
  EntraStaffTokenVerificationConfiguration
} from "./verifyEntraStaffAccessToken";

export type AuthenticatedStaffInvitationBindingResult =
  ActivationBindingAssessment;

/**
 * Nonauthorizing authenticated invitation-binding coordinator.
 *
 * Only a raw access token and a proposed invitation binding are
 * accepted as request-derived inputs.
 *
 * Token verification configuration and infrastructure dependencies
 * must be constructed in trusted backend code. Never populate them
 * from HTTP request bodies, headers, or other caller-controlled data.
 *
 * This coordinator does not authorize activation, append StaffEvents,
 * mutate storage, establish sessions, or grant retry/recovery rights.
 *
 * Successful review is not commit-time authorization. Identity status,
 * binding ownership, revocation, and deactivation ordering must still
 * be established by a separate authoritative security protocol.
 */
export async function assessAuthenticatedStaffInvitationBinding(
  accessToken: unknown,
  invitation: unknown,
  verificationConfiguration: EntraStaffTokenVerificationConfiguration,
  dependencies: ResolveVerifiedPendingStaffIdentityDependencies = {}
): Promise<AuthenticatedStaffInvitationBindingResult> {
  const denied: AuthenticatedStaffInvitationBindingResult = {
    status: "not_ready",
    diagnostics: ["authenticated_activation_binding_not_ready"],
    advisoryOnly: true,
    authoritative: false,
    identityIndependentlyVerified: false,
    activationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    productionRolloutPermitted: false
  };

  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0
  ) {
    return denied;
  }

  try {
    // The identity evidence comes only from the verified-token
    // resolver invoked inside this coordinator, never from the caller.
    const verifiedPendingIdentity =
      await resolveVerifiedPendingStaffIdentity(
        accessToken,
        verificationConfiguration,
        dependencies
      );

    // The existing pure assessment still treats evidence as claims.
    // Its review outcome never grants activation authority.
    return assessStaffInvitationActivationBinding(
      verifiedPendingIdentity,
      invitation
    );
  } catch {
    // Token errors, missing or duplicate canonical identities,
    // inactive Staff, and directory failures all fail closed.
    // Never return raw token, verification, or storage errors.
    return denied;
  }
}