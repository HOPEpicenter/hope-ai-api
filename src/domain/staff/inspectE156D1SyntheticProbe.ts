import {
  assessE156SyntheticDenialEvidence,
  type E156ProbeAssessment
} from "./assessE156SyntheticDenialEvidence";

/**
 * E156-D1: non-executing synthetic diagnostic harness.
 * No Azure imports, environment reads, credentials, network connections,
 * timer, Function trigger, or live invocation. Cannot be enabled by input.
 * A future live adapter requires its OWN separately approved PR.
 */
export type E156D1DiagnosticAssessment = Readonly<{
  classification: "synthetic_only" | "blocked";
  reason: "synthetic_evidence_assessed" | "disabled_or_invalid_contract";
  evidence: E156ProbeAssessment | null;
  target: "synthetic_table_read";
  requestedAttempts: 0;
  networkRequestPermitted: false;
  tokenRequestPermitted: false;
  storageConnectionPermitted: false;
  authorityWritePermitted: false;
  retryPermitted: false;
  deploymentPermitted: false;
  liveExecutionPermitted: false;
  effectivePermissionIsolationVerified: false;
}>;

function decision(
  classification: E156D1DiagnosticAssessment["classification"],
  reason: E156D1DiagnosticAssessment["reason"],
  evidence: E156ProbeAssessment | null
): E156D1DiagnosticAssessment {
  return Object.freeze({
    classification, reason, evidence,
    target: "synthetic_table_read",
    requestedAttempts: 0,
    networkRequestPermitted: false,
    tokenRequestPermitted: false,
    storageConnectionPermitted: false,
    authorityWritePermitted: false,
    retryPermitted: false,
    deploymentPermitted: false,
    liveExecutionPermitted: false,
    effectivePermissionIsolationVerified: false
  });
}

/**
 * Only accepts an explicitly disabled, synthetic-only plan with exactly
 * one supplied status-only evidence record. That record itself may be
 * inconclusive or invalid, but NEVER grants a capability.
 *
 * Attempt limit 1 describes a possible FUTURE approval boundary; this
 * inert harness always requests zero attempts.
 */
export function inspectE156D1SyntheticProbe(input: unknown): E156D1DiagnosticAssessment {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return decision("blocked", "disabled_or_invalid_contract", null);
    }
    const fields = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    const expected = ["mode", "enabled", "attemptLimit", "operation", "evidence"];
    if (keys.length !== expected.length ||
        keys.some(key => typeof key !== "string" || !expected.includes(key)) ||
        Object.values(fields).some(field => !("value" in field)) ||
        fields.mode.value !== "synthetic-only" ||
        fields.enabled.value !== false ||
        fields.attemptLimit.value !== 1 ||
        fields.operation.value !== "table-list-read-only") {
      return decision("blocked", "disabled_or_invalid_contract", null);
    }

    const evidence = assessE156SyntheticDenialEvidence(fields.evidence.value);
    return decision("synthetic_only", "synthetic_evidence_assessed", evidence);
  } catch {
    return decision("blocked", "disabled_or_invalid_contract", null);
  }
}
