/**
 * Advisory-only research contract for Formation assignment writer participation.
 *
 * Writer labels and acknowledgments are caller-supplied observations, not
 * independently verified storage facts. The catalog is not proof that every
 * deployed or historical writer has been identified.
 *
 * Never authorizes, executes, retries, reconciles, or grants access.
 * No storage clients, network calls, environment reads, or side effects.
 */

export const FORMATION_ASSIGNMENT_WRITER_PATHS = [
  "care_single_assign",
  "care_single_unassign",
  "care_bulk_assign",
  "care_bulk_unassign",
  "activity_intelligence_assign",
  "engagement_assignment_event",
  "formation_event_api",
  "legacy_formation_route",
  "formation_profile_rebuild"
] as const;

export type FormationAssignmentWriterPath =
  typeof FORMATION_ASSIGNMENT_WRITER_PATHS[number];

export type FormationAssignmentAcknowledgment =
  "observed" | "missing" | "failed" | "uncertain" | "contradictory";

export const FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS = [
  "ledger",
  "formationEvent",
  "globalTimeline",
  "profile"
] as const;

export type FormationAssignmentAcknowledgmentKey =
  typeof FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS[number];

export type FormationAssignmentWriterParticipationAssessment = Readonly<{
  status:
    | "observed_consistent_not_complete"
    | "pending"
    | "uncertain"
    | "blocked"
    | "contradictory";
  inputRejected: boolean;
  writerPath: FormationAssignmentWriterPath | null;
  pathClass: "event_backed" | "direct_profile" | "projection_rebuild" | null;
  missingOrUnsafeAcknowledgments: readonly FormationAssignmentAcknowledgmentKey[];
  diagnostics: readonly string[];
  reconciliationRequired: boolean;
  manualInterventionRequired: boolean;
  advisoryOnly: true;
  authoritative: false;
  writerCoverageVerified: false;
  historyComplete: false;
  crossPartitionAtomicityVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const nonAuthorizing = {
  advisoryOnly: true,
  authoritative: false,
  writerCoverageVerified: false,
  historyComplete: false,
  crossPartitionAtomicityVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

const knownPaths: ReadonlySet<string> =
  new Set(FORMATION_ASSIGNMENT_WRITER_PATHS);

const knownAcknowledgments: ReadonlySet<string> =
  new Set(["observed", "missing", "failed", "uncertain", "contradictory"]);

function failClosed(): FormationAssignmentWriterParticipationAssessment {
  return {
    status: "contradictory",
    inputRejected: true,
    writerPath: null,
    pathClass: null,
    missingOrUnsafeAcknowledgments: [...FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS],
    diagnostics: ["invalid_participation_evidence_fail_closed"],
    reconciliationRequired: true,
    manualInterventionRequired: true,
    ...nonAuthorizing
  };
}

function ownDataValue(
  record: object,
  key: string
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("Missing own data property");
  }
  return descriptor.value;
}

function hasExactKeys(record: object, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length &&
    actual.every(key => typeof key === "string" && keys.includes(key));
}

function classifyPath(
  path: FormationAssignmentWriterPath
): "event_backed" | "direct_profile" | "projection_rebuild" {
  if (path === "care_bulk_assign" || path === "care_bulk_unassign") {
    return "direct_profile";
  }
  if (path === "formation_profile_rebuild") {
    return "projection_rebuild";
  }
  return "event_backed";
}

export function assessFormationAssignmentWriterParticipation(
  evidence: unknown
): FormationAssignmentWriterParticipationAssessment {
  try {
    if (
      !evidence ||
      typeof evidence !== "object" ||
      Array.isArray(evidence) ||
      !hasExactKeys(evidence, ["writerPath", "acknowledgments"])
    ) {
      return failClosed();
    }

    const path = ownDataValue(evidence, "writerPath");
    const acknowledgments = ownDataValue(evidence, "acknowledgments");

    if (typeof path !== "string" || !knownPaths.has(path)) {
      return failClosed();
    }

    if (
      !acknowledgments ||
      typeof acknowledgments !== "object" ||
      Array.isArray(acknowledgments) ||
      !hasExactKeys(acknowledgments, FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS)
    ) {
      return failClosed();
    }

    const values = {} as Record<
      FormationAssignmentAcknowledgmentKey,
      FormationAssignmentAcknowledgment
    >;

    for (const key of FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS) {
      const value = ownDataValue(acknowledgments, key);
      if (typeof value !== "string" || !knownAcknowledgments.has(value)) {
        return failClosed();
      }
      values[key] = value as FormationAssignmentAcknowledgment;
    }

    const writerPath = path as FormationAssignmentWriterPath;
    const pathClass = classifyPath(writerPath);

    const missingOrUnsafeAcknowledgments =
      FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS.filter(
        key => values[key] !== "observed"
      );

    const diagnostics: string[] = [
      `writer:${writerPath}:${pathClass}`,
      ...missingOrUnsafeAcknowledgments.map(
        key => `acknowledgment:${key}:${values[key]}`
      )
    ];

    let status: FormationAssignmentWriterParticipationAssessment["status"];

    if (
      FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS.some(
        key => values[key] === "contradictory"
      )
    ) {
      status = "contradictory";
    } else if (
      FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS.some(
        key => values[key] === "uncertain"
      )
    ) {
      status = "uncertain";
    } else if (
      pathClass !== "event_backed" ||
      FORMATION_ASSIGNMENT_ACKNOWLEDGMENTS.some(
        key => values[key] === "failed"
      )
    ) {
      status = "blocked";
    } else if (missingOrUnsafeAcknowledgments.length > 0) {
      status = "pending";
    } else {
      status = "observed_consistent_not_complete";
    }

    if (pathClass !== "event_backed") {
      diagnostics.push("writer_path_requires_architecture_review");
    }

    diagnostics.push("observations_do_not_prove_writer_or_history_completeness");

    return {
      status,
      inputRejected: false,
      writerPath,
      pathClass,
      missingOrUnsafeAcknowledgments,
      diagnostics,
      reconciliationRequired: status !== "observed_consistent_not_complete",
      manualInterventionRequired:
        status === "blocked" ||
        status === "uncertain" ||
        status === "contradictory",
      ...nonAuthorizing
    };
  } catch {
    // Proxies, accessors, and hostile reflection must never escape.
    return failClosed();
  }
}
