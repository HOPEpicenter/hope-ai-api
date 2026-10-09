import type { OAuthAuthoritativeSessionV1 } from "../../contracts/oauthAuthoritativeSession.v1";

import {
  resolveVerifiedEntraStaffIdentity,
  type ResolveVerifiedEntraStaffIdentityDependencies
} from "./resolveVerifiedEntraStaffIdentity";

import type {
  EntraStaffTokenVerificationConfiguration
} from "./verifyEntraStaffAccessToken";

import {
  establishOAuthTrustedSessionBinding,
  type OAuthSessionEstablishmentDependencies
} from "./establishOAuthTrustedSessionBinding";

/**
 * All settings and dependencies must be constructed in trusted
 * backend code, never from the incoming HTTP request.
 *
 * Do not expose this function as an endpoint without designing
 * session possession, replay protection, and issuance policy.
 */
export interface OAuthAuthenticatedSessionDependencies {
  verificationConfiguration: EntraStaffTokenVerificationConfiguration;
  identityDependencies?: ResolveVerifiedEntraStaffIdentityDependencies;
  establishmentDependencies: OAuthSessionEstablishmentDependencies;
  nowMilliseconds: number;
  lifetimeMilliseconds: number;
}

export type OAuthAuthenticatedSessionResult =
  | {
      established: true;
      record: OAuthAuthoritativeSessionV1;
    }
  | {
      established: false;
      reason: "authenticated_session_denied";
    };

/**
 * Synthetic-only authenticated establishment coordinator.
 *
 * The only source of canonical identity is the verified Entra
 * access-token resolver. No caller-supplied identity, staff ID,
 * tenant ID, object ID, or binding ID is accepted here.
 *
 * Success does not prove session possession or prevent replay.
 * Session issuance and credential authorization remain disabled.
 */
export async function establishOAuthAuthenticatedSession(
  accessToken: string,
  dependencies: OAuthAuthenticatedSessionDependencies
): Promise<OAuthAuthenticatedSessionResult> {
  const denied = {
    established: false as const,
    reason: "authenticated_session_denied" as const
  };

  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    !dependencies ||
    typeof dependencies !== "object" ||
    !dependencies.verificationConfiguration ||
    !dependencies.establishmentDependencies ||
    !Number.isSafeInteger(dependencies.nowMilliseconds) ||
    dependencies.nowMilliseconds < 0 ||
    !Number.isSafeInteger(dependencies.lifetimeMilliseconds) ||
    dependencies.lifetimeMilliseconds <= 0
  ) {
    return denied;
  }

  try {
    // Token verification and unique active Staff Directory
    // resolution must complete before the first session write.
    const identity = await resolveVerifiedEntraStaffIdentity(
      accessToken,
      dependencies.verificationConfiguration,
      dependencies.identityDependencies
    );

    const result = await establishOAuthTrustedSessionBinding(
      {
        identity,
        nowMilliseconds: dependencies.nowMilliseconds,
        lifetimeMilliseconds: dependencies.lifetimeMilliseconds
      },
      dependencies.establishmentDependencies
    );

    if (!result.created) {
      return denied;
    }

    return {
      established: true,
      record: result.record
    };
  } catch {
    // Authentication and repository errors are indistinguishable
    // to the caller and must never establish a session.
    return denied;
  }
}
