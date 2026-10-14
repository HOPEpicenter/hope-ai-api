/**
 * Candidate requirements for staff invitation activation.
 *
 * This evaluates caller-supplied evidence, not independently verified facts.
 * It does not validate JWT signatures, authorize mutations, access storage,
 * sequence events, or grant retry/recovery/production rollout permission.
 */
export type ActivationRequirementsEvidence = Readonly<{
  tokenVerification: "verified" | "unverified" | "failed";
  principalTenantId: string;
  principalObjectId: string;
  invitedTenantId: string;
  invitedObjectId: string;
  canonicalStatus: "pending" | "active" | "inactive" | "missing" | "conflict";
  concurrentDeactivation: boolean;
  persistenceOutcome: "not_attempted" | "committed" | "uncertain" | "failed";
}>;

export type ActivationRequirementsAssessment = Readonly<{
  status:
    | "eligible_for_architecture_review"
    | "not_ready"
    | "reconciliation_required"
    | "input_rejected";
  diagnostics: readonly string[];
  advisoryOnly: true;
  authoritative: false;
  identityIndependentlyVerified: false;
  activationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const nonAuthorizing = {
  advisoryOnly: true,
  authoritative: false,
  identityIndependentlyVerified: false,
  activationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

const expectedKeys = [
  "tokenVerification",
  "principalTenantId",
  "principalObjectId",
  "invitedTenantId",
  "invitedObjectId",
  "canonicalStatus",
  "concurrentDeactivation",
  "persistenceOutcome"
] as const;

const guidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assess(
  status: ActivationRequirementsAssessment["status"],
  diagnostics: string[]
): ActivationRequirementsAssessment {
  return { status, diagnostics, ...nonAuthorizing };
}

function invalid(): ActivationRequirementsAssessment {
  return assess("input_rejected", ["activation_evidence_invalid_fail_closed"]);
}

export function assessStaffInvitationActivationRequirements(
  input: unknown
): ActivationRequirementsAssessment {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return invalid();
    }

    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== expectedKeys.length ||
      keys.some(key => typeof key !== "string" ||
        !expectedKeys.includes(key as typeof expectedKeys[number]))
    ) {
      return invalid();
    }

    const values: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return invalid();
      }
      values[key] = descriptor.value;
    }

    const token = values.tokenVerification;
    const canonical = values.canonicalStatus;
    const persistence = values.persistenceOutcome;

    if (
      !["verified", "unverified", "failed"].includes(token as string) ||
      !["pending", "active", "inactive", "missing", "conflict"].includes(canonical as string) ||
      !["not_attempted", "committed", "uncertain", "failed"].includes(persistence as string) ||
      typeof values.concurrentDeactivation !== "boolean"
    ) {
      return invalid();
    }

    for (const key of [
      "principalTenantId", "principalObjectId",
      "invitedTenantId", "invitedObjectId"
    ]) {
      if (typeof values[key] !== "string" ||
          !guidPattern.test(values[key] as string)) {
        return invalid();
      }
    }

    const diagnostics: string[] = [];

    if (token !== "verified") {
      diagnostics.push("verified_entra_principal_required");
    }

    if (
      (values.principalTenantId as string).toLowerCase() !==
        (values.invitedTenantId as string).toLowerCase() ||
      (values.principalObjectId as string).toLowerCase() !==
        (values.invitedObjectId as string).toLowerCase()
    ) {
      diagnostics.push("principal_invitation_binding_mismatch");
    }

    if (canonical !== "pending") {
      diagnostics.push(`canonical_status_${canonical}`);
    }

    if (values.concurrentDeactivation) {
      diagnostics.push("concurrent_deactivation_requires_reconciliation");
    }

    if (persistence !== "not_attempted") {
      diagnostics.push(`persistence_${persistence}_requires_review`);
    }

    if (values.concurrentDeactivation ||
        persistence === "uncertain" ||
        persistence === "failed" ||
        persistence === "committed") {
      return assess("reconciliation_required", diagnostics);
    }

    if (diagnostics.length > 0) {
      return assess("not_ready", diagnostics);
    }

    return assess("eligible_for_architecture_review", [
      "review_eligible_only_no_execution_authority"
    ]);
  } catch {
    // Revoked proxies and hostile reflection must fail closed.
    return invalid();
  }
}