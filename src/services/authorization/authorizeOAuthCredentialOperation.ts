import {
  isOAuthCredentialMetadataV1
} from "../../contracts/oauthCredentialStorage.v1";

import {
  isOAuthSessionPossessionVerifierV1,
  type OAuthSensitiveOperationV1
} from "../../contracts/oauthSessionPossession.v1";

import {
  isOAuthReplayChallengeAvailableV2
} from "../../contracts/oauthOperationReplayChallenge.v2";

import {
  resolveVerifiedEntraStaffIdentity,
  type ResolveVerifiedEntraStaffIdentityDependencies
} from "./resolveVerifiedEntraStaffIdentity";

import type {
  EntraStaffTokenVerificationConfiguration
} from "./verifyEntraStaffAccessToken";

import {
  resolveOAuthSessionEvidence,
  type OAuthSessionEvidenceReader
} from "./resolveOAuthSessionEvidence";

import {
  verifyOAuthSessionPossession
} from "./verifyOAuthSessionPossession";

import {
  evaluateOAuthCredentialOwnership
} from "./oauthCredentialOwnerAuthorization";

import {
  consumeOAuthReplayChallengeV2,
  type OAuthReplayChallengeAtomicRepositoryV2
} from "./consumeOAuthReplayChallengeV2";

/**
 * Request selectors and proof material. None of these fields
 * constitute trusted identity, session or repository evidence.
 */
export interface OAuthCredentialOperationRequest {
  accessToken: string;
  sessionSecret: string;
  credentialId: string;
  challengeId: string;
  operation: OAuthSensitiveOperationV1;
}

/**
 * Every dependency must be built by trusted server infrastructure.
 * Readers must perform authoritative reads and return all matching
 * records so duplicate bindings cannot be silently concealed.
 */
export interface OAuthCredentialOperationDependencies {
  verificationConfiguration: EntraStaffTokenVerificationConfiguration;
  identityDependencies?: ResolveVerifiedEntraStaffIdentityDependencies;
  sessionBindingId: string;
  readSessions: OAuthSessionEvidenceReader;
  readPossessionVerifiers:
    (sessionBindingId: string) => Promise<readonly unknown[]>;
  readCredentials:
    (credentialId: string) => Promise<readonly unknown[]>;
  readReplayChallenges:
    (challengeId: string) => Promise<readonly unknown[]>;
  replayRepository: OAuthReplayChallengeAtomicRepositoryV2;
  clock?: () => number;
}

export type OAuthCredentialOperationDecision =
  | { authorized: true }
  | {
      authorized: false;
      reason: "oauth_operation_denied";
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000;
}

function validOperation(
  value: unknown
): value is OAuthSensitiveOperationV1 {
  return value === "credential_read" ||
    value === "credential_rotate" ||
    value === "credential_revoke";
}

function validRequest(
  input: unknown
): input is OAuthCredentialOperationRequest {
  if (!input || typeof input !== "object" ||
      Array.isArray(input)) {
    return false;
  }

  const request = input as Record<string, unknown>;
  const keys = Object.keys(request);
  const expected = [
    "accessToken",
    "sessionSecret",
    "credentialId",
    "challengeId",
    "operation"
  ];

  return keys.length === expected.length &&
    expected.every(key =>
      Object.prototype.hasOwnProperty.call(request, key)
    ) &&
    typeof request.accessToken === "string" &&
    request.accessToken.length > 0 &&
    typeof request.sessionSecret === "string" &&
    request.sessionSecret.length > 0 &&
    validUuid(request.credentialId) &&
    validUuid(request.challengeId) &&
    validOperation(request.operation);
}

function validDependencies(
  deps: OAuthCredentialOperationDependencies
): boolean {
  return !!deps &&
    typeof deps === "object" &&
    !!deps.verificationConfiguration &&
    validUuid(deps.sessionBindingId) &&
    typeof deps.readSessions === "function" &&
    typeof deps.readPossessionVerifiers === "function" &&
    typeof deps.readCredentials === "function" &&
    typeof deps.readReplayChallenges === "function" &&
    !!deps.replayRepository &&
    typeof deps.replayRepository.consumeIfAvailableV2 === "function" &&
    (deps.clock === undefined ||
      typeof deps.clock === "function");
}

async function exactlyOne(
  reader: (id: string) => Promise<readonly unknown[]>,
  id: string
): Promise<unknown | null> {
  const records = await reader(id);

  return Array.isArray(records) && records.length === 1
    ? records[0]
    : null;
}

/**
 * Isolated authorization coordinator only.
 *
 * No credential payload is returned or mutated.
 * No endpoint, cookie, token issuance or OAuth operation is enabled.
 *
 * Trust originates with verified Entra token resolution and trusted
 * server-injected readers. Client-supplied record snapshots, owners,
 * digests, trusted session IDs and authorization timestamps are not
 * accepted.
 *
 * Session/credential revocation after authoritative reads remains
 * an execution-boundary concern. This is not an atomic transaction
 * across all evidence repositories.
 */
export async function authorizeOAuthCredentialOperation(
  input: unknown,
  dependencies: OAuthCredentialOperationDependencies
): Promise<OAuthCredentialOperationDecision> {
  const denied: OAuthCredentialOperationDecision = {
    authorized: false,
    reason: "oauth_operation_denied"
  };

  if (!validRequest(input) ||
      !validDependencies(dependencies)) {
    return denied;
  }

  try {
    const clock = dependencies.clock ?? Date.now;
    const firstNow = clock();

    if (!validTime(firstNow)) return denied;

    // Real token verification and unique active Staff resolution.
    // Never accept identity claims directly from the request.
    const identity = await resolveVerifiedEntraStaffIdentity(
      input.accessToken,
      dependencies.verificationConfiguration,
      dependencies.identityDependencies
    );

    const sessionNow = clock();

    if (!validTime(sessionNow) ||
        sessionNow < firstNow) {
      return denied;
    }

    // The binding ID is injected by trusted server infrastructure.
    const sessionDecision = await resolveOAuthSessionEvidence(
      dependencies.readSessions,
      {
        identity,
        sessionBindingId: dependencies.sessionBindingId
      },
      sessionNow
    );

    if (!sessionDecision.allowed) return denied;

    const verifier = await exactlyOne(
      dependencies.readPossessionVerifiers,
      sessionDecision.evidence.sessionBindingId
    );

    if (!isOAuthSessionPossessionVerifierV1(verifier)) {
      return denied;
    }

    const possessionNow = clock();

    if (!validTime(possessionNow) ||
        possessionNow < sessionNow) {
      return denied;
    }

    const possession = verifyOAuthSessionPossession({
      sessionBindingId: sessionDecision.evidence.sessionBindingId,
      credential: input.sessionSecret,
      verifier,
      nowMilliseconds: possessionNow
    });

    if (!possession.verified) return denied;

    // The authoritative credential record determines its owner.
    const credential = await exactlyOne(
      dependencies.readCredentials,
      input.credentialId
    );

    if (!isOAuthCredentialMetadataV1(credential) ||
        credential.credentialId !== input.credentialId) {
      return denied;
    }

    const ownershipNow = clock();

    if (!validTime(ownershipNow) ||
        ownershipNow < possessionNow ||
        ownershipNow >= Date.parse(credential.expiresAt)) {
      return denied;
    }

    const ownership = evaluateOAuthCredentialOwnership({
      identity,
      session: sessionDecision.evidence,
      storedOwner: credential.owner,
      staffStatus: "active",
      credentialStatus: credential.status
    });

    if (!ownership.allowed) return denied;

    // The expected challenge digest and revision must come from
    // the authoritative stored record, not from request claims.
    const challenge = await exactlyOne(
      dependencies.readReplayChallenges,
      input.challengeId
    );

    const challengeNow = clock();

    if (!validTime(challengeNow) ||
        challengeNow < ownershipNow ||
        !isOAuthReplayChallengeAvailableV2(
          challenge,
          challengeNow
        )) {
      return denied;
    }

    if (
      challenge.challengeId !== input.challengeId ||
      challenge.sessionBindingId !==
        sessionDecision.evidence.sessionBindingId ||
      challenge.credentialId !== credential.credentialId ||
      challenge.operation !== input.operation
    ) {
      return denied;
    }

    // Consume only after identity, session possession and owner
    // checks have passed. The repository revalidates stored metadata,
    // ETag and trusted expiry at its own commit boundary.
    const consumption = await consumeOAuthReplayChallengeV2(
      {
        challengeId: challenge.challengeId,
        sessionBindingId: challenge.sessionBindingId,
        credentialId: credential.credentialId,
        operation: challenge.operation,
        expectedChallengeDigest: challenge.challengeDigest,
        expectedRevision: challenge.revision,
        nowMilliseconds: challengeNow
      },
      { repository: dependencies.replayRepository }
    );

    if (!consumption.consumed) return denied;

    // This authorizes the isolated composition decision ONLY.
    // Any future credential operation must recheck authoritative
    // session, staff and credential state at its execution boundary.
    return { authorized: true };
  } catch {
    // Verification, repository or clock uncertainty denies access.
    return denied;
  }
}
