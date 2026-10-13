import {
  evaluateStaffWriterCoordination,
  type StaffWriterCoordinationEvidence,
  type StaffWriterCoordinationRequest,
  type StaffWriterCoordinationResult
} from "./staffWriterCoordinationContract";

/**
 * Pure, synthetic, non-authorizing research proof. It describes security and
 * persistence hazards around a staff writer operation. It never authorizes,
 * executes, sequences, compensates, or retries anything, and it makes no
 * idempotency, cross-table atomicity, or global uniqueness claim.
 */
export const STAFF_WRITER_PARTICIPATION_HAZARDS = [
  "security_acknowledgement_lost",
  "staff_event_acknowledgement_lost",
  "duplicate_operation_observed",
  "duplicate_event_observed",
  "binding_ownership_conflict",
  "external_invitation_succeeded_before_append_failure",
  "external_invitation_outcome_uncertain",
  "staff_event_append_failed"
] as const;

export type StaffWriterParticipationHazard =
  typeof STAFF_WRITER_PARTICIPATION_HAZARDS[number];

export type StaffWriterParticipationSafetyStatus =
  | "observed_consistent"
  | "pending"
  | "uncertain"
  | "blocked"
  | "contradictory";

export type StaffWriterParticipationSafetyAssessment = Readonly<{
  coordination: StaffWriterCoordinationResult;
  status: StaffWriterParticipationSafetyStatus;
  hazards: readonly StaffWriterParticipationHazard[];
  inputRejected: boolean;
  reconciliationRequired: boolean;
  manualInterventionRequired: boolean;
  diagnostics: readonly string[];
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  securityTransactionVerified: false;
  crossTableAtomicityVerified: false;
  operationIdUniquenessEnforced: false;
}>;

// Minimum status each hazard imposes, plus its operational significance.
// Hazards only escalate the coordination result; they never downgrade it
// and never create a security decision.
const hazardEffects: Readonly<Record<
  StaffWriterParticipationHazard,
  { floor: StaffWriterParticipationSafetyStatus; note: string }
>> = {
  security_acknowledgement_lost: {
    floor: "uncertain",
    note: "security_outcome_unknown_no_retry"
  },
  staff_event_acknowledgement_lost: {
    floor: "uncertain",
    note: "staff_event_may_exist_no_further_append"
  },
  duplicate_operation_observed: {
    floor: "blocked",
    note: "duplicate_is_not_idempotent_success"
  },
  duplicate_event_observed: {
    floor: "blocked",
    note: "duplicate_is_not_idempotent_success"
  },
  binding_ownership_conflict: {
    floor: "blocked",
    note: "binding_owned_elsewhere"
  },
  external_invitation_succeeded_before_append_failure: {
    floor: "blocked",
    note: "partial_external_side_effect_no_reinvite"
  },
  external_invitation_outcome_uncertain: {
    floor: "uncertain",
    note: "invitation_outcome_unknown_no_reinvite"
  },
  staff_event_append_failed: {
    floor: "blocked",
    note: "append_failed_no_automatic_recovery"
  }
};

const severity: Readonly<Record<StaffWriterParticipationSafetyStatus, number>> = {
  observed_consistent: 0,
  pending: 1,
  uncertain: 2,
  blocked: 3,
  contradictory: 4
};

const invitationHazards = new Set<StaffWriterParticipationHazard>([
  "external_invitation_succeeded_before_append_failure",
  "external_invitation_outcome_uncertain"
]);

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  securityTransactionVerified: false,
  crossTableAtomicityVerified: false,
  operationIdUniquenessEnforced: false
} as const;

function worst(
  a: StaffWriterParticipationSafetyStatus,
  b: StaffWriterParticipationSafetyStatus
): StaffWriterParticipationSafetyStatus {
  return severity[b] > severity[a] ? b : a;
}

function fromCoordination(
  status: StaffWriterCoordinationResult["status"]
): StaffWriterParticipationSafetyStatus {
  switch (status) {
    case "committed": return "observed_consistent";
    case "pending": return "pending";
    case "uncertain": return "uncertain";
    case "rejected": return "blocked";
    default: return "contradictory";
  }
}

function parseHazards(
  hazards: unknown
): readonly StaffWriterParticipationHazard[] | null {
  try {
    if (hazards === undefined) return [];
    if (!Array.isArray(hazards)) return null;
    const known = new Set<string>(STAFF_WRITER_PARTICIPATION_HAZARDS);
    const seen = new Set<string>();
    // Inspect actual indexed contents, not a caller-controlled iterator.
    // Reject holes rather than treating them as absent observations.
    for (let index = 0; index < hazards.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(hazards, index)) {
        return null;
      }
      const value = hazards[index];
      if (typeof value !== "string" || !known.has(value)) return null;
      seen.add(value);
    }
    // Deterministic: canonical declaration order, duplicates collapsed.
    return STAFF_WRITER_PARTICIPATION_HAZARDS.filter(h => seen.has(h));
  } catch {
    // Hostile collections (throwing proxies/iterators) fail closed.
    return null;
  }
}

const failClosedCoordination: StaffWriterCoordinationResult = {
  status: "inconsistent",
  pathway: null,
  reason: "invalid_or_contradictory_evidence",
  reconciliationRequired: true,
  manualInterventionRequired: true,
  executionPermitted: false,
  retryPermitted: false,
  authoritative: false
};

export function assessStaffWriterParticipationSafety(
  request: StaffWriterCoordinationRequest,
  evidence: StaffWriterCoordinationEvidence,
  hazards?: readonly StaffWriterParticipationHazard[]
): StaffWriterParticipationSafetyAssessment {
  // The existing evaluator owns all category, state, identity, revision and
  // binding validation. It is called exactly once and never re-implemented.
  let coordination: StaffWriterCoordinationResult;
  let evaluatorThrew = false;
  try {
    coordination = evaluateStaffWriterCoordination(request, evidence);
  } catch {
    coordination = failClosedCoordination;
    evaluatorThrew = true;
  }

  const parsed = parseHazards(hazards);
  const diagnostics: string[] = [
    `coordination:${coordination.status}:${coordination.reason}`
  ];
  let status = fromCoordination(coordination.status);
  let inputRejected = evaluatorThrew;
  if (evaluatorThrew) diagnostics.push("coordination_evaluator_threw_fail_closed");

  const accepted = parsed ?? [];
  if (parsed === null) {
    inputRejected = true;
    status = worst(status, "contradictory");
    diagnostics.push("hazard_input_invalid_fail_closed");
  }

  let category: unknown;
  try {
    category = (request as unknown as { mutationCategory?: unknown } | null)
      ?.mutationCategory;
  } catch {
    category = undefined;
  }
  for (const hazard of accepted) {
    const effect = hazardEffects[hazard];
    status = worst(status, effect.floor);
    diagnostics.push(`hazard:${hazard}:${effect.note}`);
    if (invitationHazards.has(hazard) && category !== "invitation") {
      status = worst(status, "contradictory");
      diagnostics.push(`hazard:${hazard}:category_is_not_invitation`);
    }
  }
  if (status === "observed_consistent") {
    diagnostics.push("observed_consistent_only_no_authorization_or_atomicity");
  }

  const escalate = inputRejected || accepted.length > 0;
  return {
    coordination,
    status,
    hazards: accepted,
    inputRejected,
    // Wrapper may only raise these, never lower the coordination values.
    reconciliationRequired: coordination.reconciliationRequired || escalate,
    manualInterventionRequired:
      coordination.manualInterventionRequired || escalate,
    diagnostics,
    ...nonAuthorizing
  };
}
