import type { TableClient } from "@azure/data-tables";

import {
  validateStaffInvitationIntent
} from "../../contracts/staffInvitationIntent.v1";

import {
  StaffInvitationAuditedStorageAdapter
} from "../../repositories/staffInvitationAuditedStorageAdapter";

import {
  StaffInvitationAuditTableRecorderPrototype
} from "../../repositories/staffInvitationAuditTableRecorderPrototype";

import type {
  StaffInvitationIntentStoragePrototypeRepository,
  StaffInvitationIntentStorageResult,
  StaffInvitationIntentReadResult
} from "../../repositories/staffInvitationIntentStoragePrototypeRepository";

import type {
  EntraStaffTokenVerificationConfiguration
} from "../authorization/verifyEntraStaffAccessToken";

import type {
  AuthenticatedStaffAuthorizationConfiguration
} from "../authorization/authorizeAuthenticatedStaffAction";

import {
  resolveProtectedInvitationAuditActor,
  type ProtectedInvitationAuditActorDependencies
} from "./resolveProtectedInvitationAuditActor";

export type ProtectedInvitationOperation = "create" | "read";

export type ProtectedInvitationOperationResult = Readonly<{
  status:
    | "rejected"
    | "unavailable"
    | "invalid_input"
    | StaffInvitationIntentStorageResult["status"]
    | StaffInvitationIntentReadResult["status"];
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

type StoragePort = Pick<
  StaffInvitationIntentStoragePrototypeRepository,
  "recordIntent" | "inspectIntent"
>;

export type ProtectedInvitationOperationPorts = Readonly<{
  storage: StoragePort;
  auditTable: Pick<TableClient, "createEntity">;
}>;

const denied = Object.freeze({
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

function result(
  status: ProtectedInvitationOperationResult["status"]
): ProtectedInvitationOperationResult {
  return Object.freeze({ status, ...denied });
}

/**
 * Isolated, non-authorizing C6 integration.
 *
 * Only server-trusted code may supply configuration, infrastructure
 * ports and dependencies. Never pass request-derived ports, an
 * authorization callback or a claimed actor binding.
 *
 * The production default invokes the existing authenticated
 * system.admin authorization path.
 *
 * Intent actor equality is necessary but not sufficient for
 * operational authorization or audit durability.
 *
 * Does not send invitations, invoke Graph, create tables,
 * expose an HTTP endpoint, schedule work or grant rollout.
 */
export async function runProtectedStaffInvitationAuditOperation(
  accessToken: string,
  verificationConfiguration: EntraStaffTokenVerificationConfiguration,
  administratorConfiguration: AuthenticatedStaffAuthorizationConfiguration,
  action: unknown,
  input: unknown,
  ports: ProtectedInvitationOperationPorts,
  dependencies: ProtectedInvitationAuditActorDependencies = {}
): Promise<ProtectedInvitationOperationResult> {
  if (action !== "create" && action !== "read") {
    return result("invalid_input");
  }

  const checked = validateStaffInvitationIntent(input);

  if (!checked.intent) {
    return result("invalid_input");
  }

  const intent = checked.intent;

  try {
    const bound = await resolveProtectedInvitationAuditActor(
      accessToken,
      verificationConfiguration,
      administratorConfiguration,
      dependencies
    );

    if (
      bound.status !== "authenticated_admin_bound" ||
      !bound.actor
    ) {
      return result(
        bound.status === "unavailable" ? "unavailable" : "rejected"
      );
    }

    if (intent.actorId !== bound.actor.canonicalStaffId) {
      return result("rejected");
    }

    // Ports must have been supplied by trusted backend composition.
    // Do not fall back to a default Azure connection or create tables.
    if (
      !ports ||
      !ports.storage ||
      !ports.auditTable ||
      typeof ports.storage.recordIntent !== "function" ||
      typeof ports.storage.inspectIntent !== "function" ||
      typeof ports.auditTable.createEntity !== "function"
    ) {
      return result("unavailable");
    }

    const recorder = new StaffInvitationAuditTableRecorderPrototype(
      ports.auditTable,
      bound
    );

    const adapter = new StaffInvitationAuditedStorageAdapter(
      ports.storage,
      recorder,
      bound.actor.actorCorrelationId
    );

    const outcome = action === "create"
      ? await adapter.recordIntent(intent)
      : await adapter.inspectIntent(intent);

    return result(outcome.status);
  } catch {
    return result("unavailable");
  }
}
