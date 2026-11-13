/**
 * E156: inert, status-only classification of caller-supplied SYNTHETIC
 * Azure Table probe evidence. Never performs I/O or authorizes any action.
 *
 * A classification is never proof of effective RBAC isolation: a future
 * independently approved live probe must bind token principal, private
 * endpoint reachability and service error evidence to one request.
 */
export type E156ProbeAssessment = Readonly<{
  classification: "candidate_permission_denial" | "inconclusive" | "invalid_evidence";
  reason:
    | "permission_mismatch_candidate"
    | "identity_not_verified"
    | "network_not_verified"
    | "authentication_failure"
    | "network_or_policy_denial"
    | "unexpected_success"
    | "target_not_found"
    | "other_service_response"
    | "invalid_or_extra_fields";
  liveProbePermitted: false;
  storageConnectionPermitted: false;
  authorityWritePermitted: false;
  retryPermitted: false;
  executionPermitted: false;
  effectivePermissionIsolationVerified: false;
}>;

type Classification = E156ProbeAssessment["classification"];
type Reason = E156ProbeAssessment["reason"];
const allowedKeys = new Set([
  "identityMatched", "privateRouteVerified", "httpStatus", "serviceErrorCode"
]);
const permittedCodes = new Set([
  "AuthorizationPermissionMismatch",
  "AuthorizationFailure",
  "AuthenticationFailed"
]);

function result(classification: Classification, reason: Reason): E156ProbeAssessment {
  return Object.freeze({
    classification, reason,
    liveProbePermitted: false,
    storageConnectionPermitted: false,
    authorityWritePermitted: false,
    retryPermitted: false,
    executionPermitted: false,
    effectivePermissionIsolationVerified: false
  });
}

/**
 * Accepts only four primitive status fields and rejects all other fields,
 * including tokens, response bodies, identities, URLs and error details.
 * Own-data-property inspection avoids invoking getters.
 */
export function assessE156SyntheticDenialEvidence(input: unknown): E156ProbeAssessment {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return result("invalid_evidence", "invalid_or_extra_fields");
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 4 ||
        keys.some(key => typeof key !== "string" || !allowedKeys.has(key)) ||
        Object.values(descriptors).some(d => !("value" in d))) {
      return result("invalid_evidence", "invalid_or_extra_fields");
    }
    const matched = descriptors.identityMatched.value;
    const route = descriptors.privateRouteVerified.value;
    const status = descriptors.httpStatus.value;
    const code = descriptors.serviceErrorCode.value;
    if (typeof matched !== "boolean" || typeof route !== "boolean" ||
        !Number.isInteger(status) || status < 100 || status > 599 ||
        (code !== null && (typeof code !== "string" || !permittedCodes.has(code)))) {
      return result("invalid_evidence", "invalid_or_extra_fields");
    }
    if (!matched) return result("inconclusive", "identity_not_verified");
    if (!route) return result("inconclusive", "network_not_verified");
    if (status >= 200 && status < 300) {
      return result("inconclusive", "unexpected_success");
    }
    if (status === 401 || code === "AuthenticationFailed") {
      return result("inconclusive", "authentication_failure");
    }
    if (status === 404) return result("inconclusive", "target_not_found");
    if (status === 403 && code === "AuthorizationPermissionMismatch") {
      return result("candidate_permission_denial", "permission_mismatch_candidate");
    }
    if (status === 403) return result("inconclusive", "network_or_policy_denial");
    return result("inconclusive", "other_service_response");
  } catch {
    return result("invalid_evidence", "invalid_or_extra_fields");
  }
}
