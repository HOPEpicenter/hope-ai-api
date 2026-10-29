import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import {
  getFormationEventInspectionAuthorizationConfiguration
} from "../../config/formationEventInspectionAuthorization";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import type {
  AuthenticatedStaffActionDecision
} from "../../services/authorization/authorizeAuthenticatedStaffAction";
import {
  FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY
} from "../../services/formation/createFormationEventReadOnlyCredentialBoundary";

interface FormationEventInspectionHttpRequest {
  readonly method: string;
  readonly headers: {
    get(name: string): string | null;
  };
  readonly rawHeaders?: readonly string[];
  json(): Promise<unknown>;
}

interface FormationEventInspectionHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly jsonBody: unknown;
}

const IDENTITY_KEYS = ["visitorId", "eventId", "occurredAt"] as const;
const BEARER_TOKEN_PATTERN =
  /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const ALLOWED_DENIAL_REASONS = [
  "unsupported_action",
  "authentication_failed",
  "actor_mismatch",
  "staff_identity_unavailable",
  "staff_binding_mismatch",
  "administrator_configuration_missing",
  "insufficient_authority"
] as const;
const EMPTY_IDENTITY = Object.freeze({
  visitorId: undefined,
  eventId: undefined,
  occurredAt: undefined
}) as unknown as FormationEventEvidenceAcquisitionIdentityV1;
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
});

function response(status: number, error: string): FormationEventInspectionHttpResponse {
  return {
    status,
    headers: JSON_HEADERS,
    jsonBody: Object.freeze({ ok: false, error })
  };
}

function unavailable(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function isPlainDataObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function captureIdentity(value: unknown): FormationEventEvidenceAcquisitionIdentityV1 | undefined {
  try {
    if (!isPlainDataObject(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== IDENTITY_KEYS.length
      || keys.some(key => (
        typeof key !== "string"
        || !IDENTITY_KEYS.some(expectedKey => expectedKey === key)
      ))
    ) {
      return undefined;
    }

    const captured: Record<string, unknown> = Object.create(null);
    for (const key of IDENTITY_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || descriptor.enumerable !== true
      ) {
        return undefined;
      }
      captured[key] = descriptor.value;
    }
    return Object.freeze(captured) as unknown as FormationEventEvidenceAcquisitionIdentityV1;
  } catch {
    return undefined;
  }
}

function hasValidAcquisitionIdentity(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): boolean {
  const result = unavailable(identity);
  return result.status === "unavailable"
    && result.reasonCode === "observation_unavailable"
    && result.candidateRowKey !== null;
}

function rawAuthorizationHeader(request: unknown): {
  readonly present: boolean;
  readonly valid: boolean;
  readonly value?: string;
} {
  if (typeof request !== "object" || request === null) {
    return { present: false, valid: false };
  }

  try {
    const rawHeadersDescriptor = Object.getOwnPropertyDescriptor(request, "rawHeaders");
    if (
      rawHeadersDescriptor !== undefined
      && !Object.prototype.hasOwnProperty.call(rawHeadersDescriptor, "value")
    ) {
      return { present: true, valid: false };
    }
    const rawHeaders = rawHeadersDescriptor && "value" in rawHeadersDescriptor
      ? rawHeadersDescriptor.value
      : undefined;
    let rawAuthorization: string | undefined;
    if (rawHeaders !== undefined) {
      if (
        !Array.isArray(rawHeaders)
        || rawHeaders.length % 2 !== 0
        || rawHeaders.some(value => typeof value !== "string")
      ) {
        return { present: true, valid: false };
      }
      const matches: string[] = [];
      for (let index = 0; index < rawHeaders.length; index += 2) {
        if (rawHeaders[index].toLowerCase() === "authorization") {
          matches.push(rawHeaders[index + 1]);
        }
      }
      if (matches.length > 1) return { present: true, valid: false };
      rawAuthorization = matches[0];
    }

    const headers = Reflect.get(request, "headers");
    if (
      typeof headers !== "object"
      || headers === null
      || typeof (headers as Headers).get !== "function"
    ) {
      return { present: rawAuthorization !== undefined, valid: false };
    }
    const headerValue = (headers as Headers).get("authorization");
    if (
      rawAuthorization !== undefined
      && headerValue !== null
      && rawAuthorization !== headerValue
    ) {
      return { present: true, valid: false };
    }
    const value = rawAuthorization ?? headerValue ?? undefined;
    if (value === undefined) return { present: false, valid: true };
    if (value.includes(",")) return { present: true, valid: false };
    return { present: true, valid: true, value };
  } catch {
    return { present: true, valid: false };
  }
}

function isAllowedAdministratorDecision(
  value: unknown
): value is Extract<AuthenticatedStaffActionDecision, { allowed: true }> {
  try {
    if (!isPlainDataObject(value)) return false;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3
      || keys.some(key => !["allowed", "authenticatedStaffId", "action"].includes(String(key)))
    ) {
      return false;
    }
    const allowed = Object.getOwnPropertyDescriptor(value, "allowed");
    const staffId = Object.getOwnPropertyDescriptor(value, "authenticatedStaffId");
    const action = Object.getOwnPropertyDescriptor(value, "action");
    return allowed !== undefined
      && Object.prototype.hasOwnProperty.call(allowed, "value")
      && allowed.value === true
      && staffId !== undefined
      && Object.prototype.hasOwnProperty.call(staffId, "value")
      && typeof staffId.value === "string"
      && staffId.value.length > 0
      && staffId.value.trim() === staffId.value
      && action !== undefined
      && Object.prototype.hasOwnProperty.call(action, "value")
      && action.value === "system.admin";
  } catch {
    return false;
  }
}

function denialStatus(value: unknown): number {
  try {
    if (!isPlainDataObject(value)) return 403;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 2
      || !keys.includes("allowed")
      || !keys.includes("reason")
    ) {
      return 403;
    }
    const allowed = Object.getOwnPropertyDescriptor(value, "allowed");
    const reason = Object.getOwnPropertyDescriptor(value, "reason");
    if (
      !allowed
      || !Object.prototype.hasOwnProperty.call(allowed, "value")
      || allowed.value !== false
      || !reason
      || !Object.prototype.hasOwnProperty.call(reason, "value")
      || typeof reason.value !== "string"
      || !ALLOWED_DENIAL_REASONS.some(item => item === reason.value)
    ) {
      return 403;
    }
    return reason.value === "authentication_failed" ? 401 : 403;
  } catch {
    return 403;
  }
}

/**
 * Dormant HTTP adapter. It is not registered as an Azure Function. Requests
 * remain blocked after authorization until an isolated read-only credential
 * boundary is implemented and independently approved.
 */
export async function handleFormationEventInspectionHttpRequest(
  request: FormationEventInspectionHttpRequest
): Promise<FormationEventInspectionHttpResponse> {
  let method: unknown;
  try {
    method = Reflect.get(request, "method");
  } catch {
    return response(400, "Invalid request");
  }
  if (method !== "POST") return response(405, "Method not allowed");

  const authorizationHeader = rawAuthorizationHeader(request);
  if (!authorizationHeader.present || !authorizationHeader.valid || !authorizationHeader.value) {
    return response(401, "Unauthorized");
  }
  const tokenMatch = BEARER_TOKEN_PATTERN.exec(authorizationHeader.value);
  if (!tokenMatch) return response(401, "Unauthorized");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, "Invalid request");
  }
  const identity = captureIdentity(body);
  if (!identity || !hasValidAcquisitionIdentity(identity)) {
    return response(400, "Invalid request");
  }

  let configuration;
  try {
    configuration = getFormationEventInspectionAuthorizationConfiguration();
  } catch {
    return response(503, "FormationEvent inspection is unavailable");
  }
  if (
    configuration.evidenceInspectionEnabled !== true
    || configuration.authorizationConfiguration.enforcementEnabled !== true
  ) {
    return response(503, "FormationEvent inspection is unavailable");
  }
  if (!FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY) {
    return response(503, "FormationEvent inspection is unavailable");
  }

  let decision: unknown;
  try {
    const { authorizeAuthenticatedStaffAction } = await import(
      "../../services/authorization/authorizeAuthenticatedStaffAction"
    );
    decision = await authorizeAuthenticatedStaffAction(
      tokenMatch[1],
      configuration.authorizationConfiguration.verificationConfiguration,
      "system.admin",
      {
        administratorStaffIds:
          configuration.authorizationConfiguration.administratorStaffIds
      }
    );
  } catch {
    return response(503, "FormationEvent inspection is unavailable");
  }
  if (!isAllowedAdministratorDecision(decision)) {
    return response(denialStatus(decision), "Unauthorized");
  }

  if (!FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY) {
    return response(503, "FormationEvent inspection is unavailable");
  }
  return response(503, "FormationEvent inspection is unavailable");
}
