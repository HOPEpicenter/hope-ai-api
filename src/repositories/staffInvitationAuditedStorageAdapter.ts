import { types } from "node:util";
import {
  validateStaffInvitationIntent
} from "../contracts/staffInvitationIntent.v1";
import type {
  StaffInvitationIntentStoragePrototypeRepository,
  StaffInvitationIntentStorageResult,
  StaffInvitationIntentReadResult
} from "./staffInvitationIntentStoragePrototypeRepository";

/**
 * Injected C6 audit-boundary prototype.
 *
 * This adapter is not connected to any active invitation endpoint.
 * The injected audit recorder is NOT automatically trustworthy.
 * A syntactically valid actor correlation ID is not authentication.
 * No production storage access or independent audit coverage is granted.
 */

export type InvitationAuditAction = "create" | "read";

export type InvitationAuditStatus =
  | "attempted"
  | StaffInvitationIntentStorageResult["status"]
  | StaffInvitationIntentReadResult["status"];

export type InvitationAuditEvent = Readonly<{
  schemaVersion: 1;
  action: InvitationAuditAction;
  phase: "attempt" | "outcome";
  status: InvitationAuditStatus;
  operationId: string;
  actorCorrelationId: string;
}>;

export type InvitationAuditRecorder = Readonly<{
  record(event: InvitationAuditEvent): Promise<void>;
}>;

type StoragePort = Pick<
  StaffInvitationIntentStoragePrototypeRepository,
  "recordIntent" | "inspectIntent"
>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const denied = Object.freeze({
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const);

function writeFailure(
  status: StaffInvitationIntentStorageResult["status"]
): StaffInvitationIntentStorageResult {
  return Object.freeze({ status, ...denied });
}

function readFailure(
  status: StaffInvitationIntentReadResult["status"]
): StaffInvitationIntentReadResult {
  return Object.freeze({ status, ...denied });
}

/**
 * Normalize potentially hostile storage results.
 * Never forward caller-supplied authorization flags.
 * Never invoke status getters or proxy traps.
 */
function ownStatus(value: unknown): string | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      types.isProxy(value)
    ) {
      return null;
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      value, "status"
    );

    return descriptor &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function normalizeWrite(
  value: unknown
): StaffInvitationIntentStorageResult {
  const status = ownStatus(value);

  switch (status) {
    case "recorded_unverified":
    case "conflict":
    case "invalid_input":
    case "uncertain":
      return writeFailure(status);
    default:
      return writeFailure("uncertain");
  }
}

function normalizeRead(
  value: unknown
): StaffInvitationIntentReadResult {
  const status = ownStatus(value);

  switch (status) {
    case "matching_evidence":
    case "missing":
    case "contradictory":
    case "invalid_input":
    case "unavailable":
      return readFailure(status);
    default:
      return readFailure("unavailable");
  }
}
export class StaffInvitationAuditedStorageAdapter {
  constructor(
    private readonly storage: StoragePort,
    private readonly audit: InvitationAuditRecorder,
    private readonly actorCorrelationId: string
  ) {}

  private async record(
    action: InvitationAuditAction,
    phase: "attempt" | "outcome",
    status: InvitationAuditStatus,
    operationId: string
  ): Promise<boolean> {
    try {
      const event: InvitationAuditEvent = Object.freeze({
        schemaVersion: 1,
        action,
        phase,
        status,
        operationId,
        actorCorrelationId: this.actorCorrelationId
      });

      await this.audit.record(event);
      return true;
    } catch {
      return false;
    }
  }

  async recordIntent(
    input: unknown
  ): Promise<StaffInvitationIntentStorageResult> {
    const checked = validateStaffInvitationIntent(input);

    if (
      !checked.intent ||
      typeof this.actorCorrelationId !== "string" ||
      !uuidPattern.test(this.actorCorrelationId)
    ) {
      return writeFailure("invalid_input");
    }

    const intent = checked.intent;

    const before = await this.record(
      "create", "attempt", "attempted", intent.operationId
    );

    if (!before) return writeFailure("uncertain");

    let result: StaffInvitationIntentStorageResult;

    try {
      result = normalizeWrite(await this.storage.recordIntent(intent));
    } catch {
      result = writeFailure("uncertain");
    }

    const after = await this.record(
      "create", "outcome", result.status, intent.operationId
    );

    // A failed outcome audit makes a write unsafe to classify.
    // No retry is attempted.
    return after ? result : writeFailure("uncertain");
  }

  async inspectIntent(
    input: unknown
  ): Promise<StaffInvitationIntentReadResult> {
    const checked = validateStaffInvitationIntent(input);

    if (
      !checked.intent ||
      typeof this.actorCorrelationId !== "string" ||
      !uuidPattern.test(this.actorCorrelationId)
    ) {
      return readFailure("invalid_input");
    }

    const intent = checked.intent;

    const before = await this.record(
      "read", "attempt", "attempted", intent.operationId
    );

    if (!before) return readFailure("unavailable");

    let result: StaffInvitationIntentReadResult;

    try {
      result = normalizeRead(await this.storage.inspectIntent(intent));
    } catch {
      result = readFailure("unavailable");
    }

    const after = await this.record(
      "read", "outcome", result.status, intent.operationId
    );

    return after ? result : readFailure("unavailable");
  }
}
