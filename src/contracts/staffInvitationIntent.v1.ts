import { types } from "node:util";

export const STAFF_INVITATION_INTENT_SCHEMA_VERSION = 1;
export const STAFF_INVITATION_INTENT_SOURCE = "staff-invitation-intent-v1";

/**
 * Proposed pre-Graph invitation intent, not persistence evidence.
 * Contains personal information: storage must be separately reviewed.
 */
export type StaffInvitationIntentV1 = Readonly<{
  schemaVersion: 1;
  sourceIdentity: typeof STAFF_INVITATION_INTENT_SOURCE;
  operationId: string;
  actorId: string;
  displayName: string;
  recipientEmail: string;
  createdAt: string;
}>;

export type StaffInvitationIntentResult = Readonly<{
  status: "valid" | "malformed" | "unsupported_schema_version";
  diagnostic: string;
  intent?: StaffInvitationIntentV1;
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  persisted: false;
}>;

export type StaffInvitationIntentComparison = Readonly<{
  status:
    | "matching"
    | "contradictory"
    | "different_operation"
    | "invalid_evidence";
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  persisted: false;
}>;

const NEVER_AUTHORIZE = Object.freeze({
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  persisted: false
} as const);

const fields = [
  "schemaVersion",
  "sourceIdentity",
  "operationId",
  "actorId",
  "displayName",
  "recipientEmail",
  "createdAt"
] as const;

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function result(
  status: StaffInvitationIntentResult["status"],
  diagnostic: string,
  intent?: StaffInvitationIntentV1
): StaffInvitationIntentResult {
  return Object.freeze({
    status,
    diagnostic,
    ...(intent ? { intent } : {}),
    ...NEVER_AUTHORIZE
  });
}

/**
 * Copy only own, enumerable primitive data properties.
 * Never evaluate getters, toJSON, or custom object methods.
 * No persistence, network access, authorization, or side effects.
 */
function snapshot(input: unknown): Record<string, unknown> | null {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    types.isProxy(input)
  ) {
    return null;
  }

  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length ||
    keys.some(key => typeof key !== "string" || !fields.includes(key as typeof fields[number]))
  ) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(input);
  const copy: Record<string, unknown> = Object.create(null);

  for (const key of fields) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return null;
    }

    const value: unknown = descriptor.value;

    if (typeof value !== "string" && typeof value !== "number") {
      return null;
    }

    copy[key] = value;
  }

  return copy;
}

export function validateStaffInvitationIntent(
  input: unknown
): StaffInvitationIntentResult {
  try {
    const value = snapshot(input);

    if (!value) {
      return result("malformed", "invalid_intent_shape");
    }

    if (value.schemaVersion !== STAFF_INVITATION_INTENT_SCHEMA_VERSION) {
      return result(
        "unsupported_schema_version",
        "unsupported_schema_version"
      );
    }

    if (
      value.sourceIdentity !== STAFF_INVITATION_INTENT_SOURCE ||
      typeof value.operationId !== "string" ||
      !operationIdPattern.test(value.operationId) ||
      typeof value.actorId !== "string" ||
      value.actorId.length < 1 ||
      value.actorId.length > 128 ||
      value.actorId !== value.actorId.trim() ||
      typeof value.displayName !== "string" ||
      value.displayName.length < 1 ||
      value.displayName.length > 200 ||
      value.displayName !== value.displayName.trim() ||
      typeof value.recipientEmail !== "string" ||
      value.recipientEmail.length > 254 ||
      value.recipientEmail !== value.recipientEmail.trim() ||
      !emailPattern.test(value.recipientEmail) ||
      typeof value.createdAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt)
    ) {
      return result("malformed", "invalid_intent_fields");
    }

    const timestamp = new Date(value.createdAt);
    if (
      !Number.isFinite(timestamp.getTime()) ||
      timestamp.toISOString() !== value.createdAt
    ) {
      return result("malformed", "invalid_timestamp");
    }

    const intent: StaffInvitationIntentV1 = Object.freeze({
      schemaVersion: 1,
      sourceIdentity: STAFF_INVITATION_INTENT_SOURCE,
      operationId: value.operationId,
      actorId: value.actorId,
      displayName: value.displayName,
      recipientEmail: value.recipientEmail,
      createdAt: value.createdAt
    });

    return result("valid", "validated_not_persisted", intent);
  } catch {
    return result("malformed", "uninspectable_intent");
  }
}

/**
 * Compare evidence without granting execution or retry permission.
 * A matching payload does not prove either record was persisted.
 */
export function compareStaffInvitationIntents(
  left: unknown,
  right: unknown
): StaffInvitationIntentComparison {
  const first = validateStaffInvitationIntent(left);
  const second = validateStaffInvitationIntent(right);

  let status: StaffInvitationIntentComparison["status"];

  if (!first.intent || !second.intent) {
    status = "invalid_evidence";
  } else if (first.intent.operationId !== second.intent.operationId) {
    status = "different_operation";
  } else if (
    fields.every(key => first.intent![key] === second.intent![key])
  ) {
    status = "matching";
  } else {
    status = "contradictory";
  }

  return Object.freeze({ status, ...NEVER_AUTHORIZE });
}
