import {
  inspectOAuthFenceStorageReadiness
} from "./inspectOAuthFenceStorageReadiness";

/**
 * Source-grounded planning inventory, NOT proof of
 * actual participation in the OAuth ordering protocol.
 *
 * The contract has no input capable of declaring a
 * workflow coordinated or permitting execution.
 */
export const OAUTH_COORDINATION_PARTICIPATION_SCHEMA = 1;

export const OAUTH_COORDINATION_WORKFLOWS = [
  "staff_deactivation",
  "entra_binding_change",
  "session_revocation",
  "credential_revocation",
  "credential_rotation"
] as const;

export type OAuthCoordinationWorkflow =
  typeof OAUTH_COORDINATION_WORKFLOWS[number];

export interface OAuthCoordinationParticipant {
  readonly workflow: OAuthCoordinationWorkflow;
  readonly coordinationDemonstrated: false;
  readonly commitTimeEnforcementDemonstrated: false;
  readonly uncertainWriteRecoveryDemonstrated: false;
}

export interface OAuthCoordinationParticipationInspection {
  readonly schemaVersion: 1;
  readonly status: "integration_not_ready";
  readonly storageProtocolReady: false;
  readonly executionPermitted: false;
  readonly retryPermitted: false;
  readonly participants: readonly OAuthCoordinationParticipant[];
  readonly blockers: readonly string[];
}

/**
 * Conservatively reports missing integration evidence.
 *
 * This is static, non-authorizing metadata. It does not
 * perform repository reads or establish authenticity.
 */
export function inspectOAuthCoordinationParticipation():
  OAuthCoordinationParticipationInspection {

  const existingGate = inspectOAuthFenceStorageReadiness();

  const participants = OAUTH_COORDINATION_WORKFLOWS.map(
    workflow => Object.freeze({
      workflow,
      coordinationDemonstrated: false as const,
      commitTimeEnforcementDemonstrated: false as const,
      uncertainWriteRecoveryDemonstrated: false as const
    })
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    status: "integration_not_ready" as const,
    storageProtocolReady: false as const,
    executionPermitted: false as const,
    retryPermitted: false as const,
    participants: Object.freeze(participants),
    blockers: Object.freeze([...existingGate.blockers])
  });
}
