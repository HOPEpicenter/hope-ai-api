import { randomUUID } from "node:crypto";
import { types } from "node:util";

import type {
  EntraStaffTokenVerificationConfiguration
} from "../authorization/verifyEntraStaffAccessToken";

type AuthorizeAction =
  typeof import("../authorization/authorizeAuthenticatedStaffAction")
    .authorizeAuthenticatedStaffAction;

type AdministratorConfiguration =
  import("../authorization/authorizeAuthenticatedStaffAction")
    .AuthenticatedStaffAuthorizationConfiguration;

export type ProtectedInvitationAuditActorResult =
  | Readonly<{
      status: "authenticated_admin_bound";
      actor: Readonly<{
        canonicalStaffId: string;
        actorCorrelationId: string;
      }>;
      authoritative: false;
      storageAccessPermitted: false;
      invitationExecutionPermitted: false;
      retryPermitted: false;
      productionRolloutPermitted: false;
    }>
  | Readonly<{
      status: "rejected" | "unavailable";
      actor: null;
      authoritative: false;
      storageAccessPermitted: false;
      invitationExecutionPermitted: false;
      retryPermitted: false;
      productionRolloutPermitted: false;
    }>;

export type ProtectedInvitationAuditActorDependencies = Readonly<{
  /**
   * Trusted server-side injection for synthetic testing only.
   * Never populate this from HTTP or any untrusted source.
   */
  authorizeAction?: AuthorizeAction;
}>;

const denied = Object.freeze({
  authoritative: false,
  storageAccessPermitted: false,
  invitationExecutionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

function ownData(input: unknown, key: string): unknown {
  if (
    input === null ||
    typeof input !== "object" ||
    types.isProxy(input)
  ) {
    throw new Error("Authorization result invalid");
  }

  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (!descriptor || !("value" in descriptor)) {
    throw new Error("Authorization result invalid");
  }

  return descriptor.value;
}

function failure(
  status: "rejected" | "unavailable"
): ProtectedInvitationAuditActorResult {
  return Object.freeze({
    status,
    actor: null,
    ...denied
  });
}

/**
 * Creates non-operational attribution evidence after the existing
 * authenticated system.admin authorization check.
 *
 * The production path invokes the existing Entra-backed authorization
 * implementation. Configuration and dependencies must originate from
 * trusted backend code, never from an HTTP request.
 *
 * The returned correlation ID is not a canonical staff ID.
 * This result does not authorize storage or invitation execution.
 * No endpoint, table, Graph operation or scheduler is connected here.
 */
export async function resolveProtectedInvitationAuditActor(
  accessToken: string,
  verificationConfiguration: EntraStaffTokenVerificationConfiguration,
  administratorConfiguration: AdministratorConfiguration,
  dependencies: ProtectedInvitationAuditActorDependencies = {}
): Promise<ProtectedInvitationAuditActorResult> {
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    accessToken.trim() !== accessToken
  ) {
    return failure("rejected");
  }

  try {
    const authorize = dependencies.authorizeAction ??
      (await import(
        "../authorization/authorizeAuthenticatedStaffAction"
      )).authorizeAuthenticatedStaffAction;

    const decision = await authorize(
      accessToken,
      verificationConfiguration,
      "system.admin",
      administratorConfiguration
    );

    if (ownData(decision, "allowed") !== true) {
      return failure("rejected");
    }

    const action = ownData(decision, "action");
    const staffId = ownData(decision, "authenticatedStaffId");

    if (
      action !== "system.admin" ||
      typeof staffId !== "string" ||
      staffId.length === 0 ||
      staffId.length > 128 ||
      staffId.trim() !== staffId
    ) {
      return failure("rejected");
    }

    return Object.freeze({
      status: "authenticated_admin_bound",
      actor: Object.freeze({
        canonicalStaffId: staffId,
        actorCorrelationId: randomUUID()
      }),
      ...denied
    });
  } catch {
    return failure("unavailable");
  }
}
