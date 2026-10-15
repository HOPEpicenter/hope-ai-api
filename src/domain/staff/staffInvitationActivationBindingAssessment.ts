/**
 * Advisory-only assessment of claimed pending Staff identity
 * evidence against a proposed invitation binding.
 *
 * This function does NOT verify token signatures or authenticate
 * the origin of supplied evidence. Even a matching result is
 * never permission to activate or perform a write.
 */

export type ActivationBindingAssessment = Readonly<{
  status:
    | "binding_matched_for_review"
    | "not_ready"
    | "input_rejected";
  diagnostics: readonly string[];
  advisoryOnly: true;
  authoritative: false;
  identityIndependentlyVerified: false;
  activationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const evidenceKeys = [
  "staffId",
  "tenantId",
  "objectId",
  "canonicalStatus",
  "advisoryOnly",
  "authoritative",
  "activationPermitted",
  "executionPermitted",
  "retryPermitted",
  "productionRolloutPermitted"
] as const;

const invitationKeys = [
  "staffId",
  "entraTenantId",
  "entraObjectId"
] as const;

const nonAuthorizing = {
  advisoryOnly: true,
  authoritative: false,
  identityIndependentlyVerified: false,
  activationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const;

function result(
  status: ActivationBindingAssessment["status"],
  diagnostics: string[]
): ActivationBindingAssessment {
  return { status, diagnostics, ...nonAuthorizing };
}

function readExact(
  input: unknown,
  keys: readonly string[]
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" ||
      Array.isArray(input)) {
    return null;
  }

  const actual = Reflect.ownKeys(input);

  if (actual.length !== keys.length ||
      actual.some(key =>
        typeof key !== "string" || !keys.includes(key))) {
    return null;
  }

  const values: Record<string, unknown> = {};

  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(
      input, key
    );

    if (!descriptor ||
        !Object.prototype.hasOwnProperty.call(
          descriptor, "value"
        )) {
      return null;
    }

    values[key] = descriptor.value;
  }

  return values;
}

function staffIdValid(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    value.length <= 256;
}

export function assessStaffInvitationActivationBinding(
  evidenceInput: unknown,
  invitationInput: unknown
): ActivationBindingAssessment {
  try {
    const evidence = readExact(
      evidenceInput, evidenceKeys
    );

    const invitation = readExact(
      invitationInput, invitationKeys
    );

    if (!evidence || !invitation) {
      return result("input_rejected", [
        "activation_binding_input_invalid"
      ]);
    }

    if (!staffIdValid(evidence.staffId) ||
        !staffIdValid(invitation.staffId) ||
        typeof evidence.tenantId !== "string" ||
        !GUID.test(evidence.tenantId) ||
        typeof evidence.objectId !== "string" ||
        !GUID.test(evidence.objectId) ||
        typeof invitation.entraTenantId !== "string" ||
        !GUID.test(invitation.entraTenantId) ||
        typeof invitation.entraObjectId !== "string" ||
        !GUID.test(invitation.entraObjectId) ||
        evidence.canonicalStatus !== "pending" ||
        evidence.advisoryOnly !== true ||
        evidence.authoritative !== false ||
        evidence.activationPermitted !== false ||
        evidence.executionPermitted !== false ||
        evidence.retryPermitted !== false ||
        evidence.productionRolloutPermitted !== false) {
      return result("input_rejected", [
        "activation_binding_input_invalid"
      ]);
    }

    const diagnostics: string[] = [];

    if (evidence.staffId !== invitation.staffId) {
      diagnostics.push(
        "activation_staff_identity_mismatch"
      );
    }

    if (evidence.tenantId.toLowerCase() !==
        invitation.entraTenantId.toLowerCase() ||
        evidence.objectId.toLowerCase() !==
        invitation.entraObjectId.toLowerCase()) {
      diagnostics.push(
        "activation_entra_binding_mismatch"
      );
    }

    if (diagnostics.length > 0) {
      return result("not_ready", diagnostics);
    }

    return result("binding_matched_for_review", [
      "binding_claims_match_no_execution_authority"
    ]);
  } catch {
    return result("input_rejected", [
      "activation_binding_input_invalid"
    ]);
  }
}