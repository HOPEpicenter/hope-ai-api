import {
  assessStaffWriterParticipationSafety,
  type StaffWriterParticipationHazard,
  type StaffWriterParticipationSafetyAssessment
} from "./staffWriterParticipationSafetyProof";
import type {
  StaffWriterCoordinationRequest,
  StaffWriterCoordinationEvidence
} from "./staffWriterCoordinationContract";

/**
 * Known production integration gaps, not caller-supplied attestations.
 * These are not automatically cleared by complete synthetic evidence.
 */
export const STAFF_ACTIVATION_ATOMICITY_GAPS = [
  "all_staff_writers_share_ordering_unverified",
  "canonical_staff_event_atomicity_unverified",
  "commit_time_binding_continuity_unverified",
  "canonical_inactive_revoked_mapping_unverified",
  "production_writer_migration_unverified"
] as const;

export type StaffActivationAtomicityGap =
  typeof STAFF_ACTIVATION_ATOMICITY_GAPS[number];

export type StaffActivationAtomicityReadiness = Readonly<{
  status: "incomplete" | "blocked" | "uncertain" | "contradictory";
  participation: StaffWriterParticipationSafetyAssessment;
  gaps: readonly StaffActivationAtomicityGap[];
  diagnostics: readonly string[];
  reconciliationRequired: boolean;
  manualInterventionRequired: boolean;
  authoritative: false;
  activationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
  securityTransactionVerified: false;
  crossTableAtomicityVerified: false;
  allWritersCoordinated: false;
}>;

const noAuthority = {
  authoritative: false,
  activationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false,
  securityTransactionVerified: false,
  crossTableAtomicityVerified: false,
  allWritersCoordinated: false
} as const;

/**
 * Pure research assessment. No storage, route, token verification, event
 * append, authorization, retry, or external side effect occurs here.
 *
 * Even complete synthetic coordination evidence cannot establish
 * production-wide ordering or cross-table atomicity.
 */
export function assessStaffActivationAtomicityReadiness(
  request: StaffWriterCoordinationRequest,
  evidence: StaffWriterCoordinationEvidence,
  hazards?: readonly StaffWriterParticipationHazard[]
): StaffActivationAtomicityReadiness {
  const participation = assessStaffWriterParticipationSafety(
    request,
    evidence,
    hazards
  );

  let activationRequest = false;

  try {
    activationRequest =
      request !== null &&
      typeof request === "object" &&
      request.mutationCategory === "activation";
  } catch {
    activationRequest = false;
  }

  const status: StaffActivationAtomicityReadiness["status"] =
    participation.inputRejected ||
    participation.status === "contradictory"
      ? "contradictory"
      : !activationRequest
        ? "blocked"
        : participation.status === "uncertain"
          ? "uncertain"
          : participation.status === "blocked"
            ? "blocked"
            : "incomplete";

  const diagnostics = [
    ...participation.diagnostics,
    ...(activationRequest
      ? []
      : ["activation_request_required"]),
    ...STAFF_ACTIVATION_ATOMICITY_GAPS.map(
      gap => `unverified:${gap}`
    )
  ];

  return {
    status,
    participation,
    gaps: [...STAFF_ACTIVATION_ATOMICITY_GAPS],
    diagnostics,
    reconciliationRequired:
      participation.reconciliationRequired ||
      status === "uncertain" ||
      status === "contradictory",
    manualInterventionRequired:
      participation.manualInterventionRequired ||
      status === "uncertain" ||
      status === "contradictory",
    ...noAuthority
  };
}