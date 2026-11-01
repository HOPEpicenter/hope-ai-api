import type { TableClient } from "@azure/data-tables";
import {
  compareStaffInvitationIntents,
  validateStaffInvitationIntent,
  type StaffInvitationIntentV1
} from "../contracts/staffInvitationIntent.v1";

/**
 * Isolated D6 persistence prototype.
 *
 * The caller injects an existing TableClient and owns table lifecycle.
 * No active invitation endpoint or Graph sender uses this repository.
 *
 * Stored JSON contains personal information and requires separate
 * access-control, retention, and production-storage review.
 */
export const STAFF_INVITATION_INTENT_STORAGE_SOURCE =
  "staff-invitation-intent-storage-prototype-v1";

export const STAFF_INVITATION_INTENT_PARTITION =
  "staff-invitation-intent-prototype-v1";

export const STAFF_INVITATION_INTENT_MAX_JSON_BYTES = 4096;

export type StaffInvitationIntentStorageStatus =
  | "recorded_unverified"
  | "conflict"
  | "invalid_input"
  | "uncertain";

export type StaffInvitationIntentReadStatus =
  | "matching_evidence"
  | "missing"
  | "contradictory"
  | "invalid_input"
  | "unavailable";

type NeverAuthorize = Readonly<{
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  graphOutcomeVerified: false;
  productionRolloutPermitted: false;
}>;

export type StaffInvitationIntentStorageResult =
  NeverAuthorize & Readonly<{
    status: StaffInvitationIntentStorageStatus;
  }>;

export type StaffInvitationIntentReadResult =
  NeverAuthorize & Readonly<{
    status: StaffInvitationIntentReadStatus;
  }>;

const DENY = Object.freeze({
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const);

function writeResult(
  status: StaffInvitationIntentStorageStatus
): StaffInvitationIntentStorageResult {
  return Object.freeze({ status, ...DENY });
}

function readResult(
  status: StaffInvitationIntentReadStatus
): StaffInvitationIntentReadResult {
  return Object.freeze({ status, ...DENY });
}

function statusCode(error: unknown): number | null {
  try {
    if (error === null || typeof error !== "object") return null;
    const value = Reflect.get(error, "statusCode");
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function rowKey(operationId: string): string {
  return `invitation-intent-${operationId}`;
}

function serialize(intent: StaffInvitationIntentV1): string {
  return JSON.stringify({
    schemaVersion: intent.schemaVersion,
    sourceIdentity: intent.sourceIdentity,
    operationId: intent.operationId,
    actorId: intent.actorId,
    displayName: intent.displayName,
    recipientEmail: intent.recipientEmail,
    createdAt: intent.createdAt
  });
}

function checkedIntent(
  input: unknown
): { intent: StaffInvitationIntentV1; json: string } | null {
  const validated = validateStaffInvitationIntent(input);
  if (validated.status !== "valid" || !validated.intent) return null;

  const json = serialize(validated.intent);
  if (Buffer.byteLength(json, "utf8") > STAFF_INVITATION_INTENT_MAX_JSON_BYTES) {
    return null;
  }

  return { intent: validated.intent, json };
}

export class StaffInvitationIntentStoragePrototypeRepository {
  constructor(
    private readonly table: Pick<TableClient, "createEntity" | "getEntity">
  ) {}

  /**
   * Acknowledged create-only write is unverified persistence evidence.
   * Duplicate keys are conflicts, never successful idempotent replay.
   * Unknown acknowledgments remain uncertain and are never retried here.
   */
  async recordIntent(input: unknown): Promise<StaffInvitationIntentStorageResult> {
    const checked = checkedIntent(input);
    if (!checked) return writeResult("invalid_input");

    const { intent, json } = checked;

    try {
      await this.table.createEntity({
        partitionKey: STAFF_INVITATION_INTENT_PARTITION,
        rowKey: rowKey(intent.operationId),
        schemaVersion: 1,
        source: STAFF_INVITATION_INTENT_STORAGE_SOURCE,
        operationId: intent.operationId,
        intentJson: json
      });
      return writeResult("recorded_unverified");
    } catch (error) {
      if (statusCode(error) === 409) return writeResult("conflict");
      return writeResult("uncertain");
    }
  }

  /**
   * Read one independently stored record and compare exact evidence.
   * A 404 means the record was not observed on this read, not that any
   * previously uncertain write can be retried.
   */
  async inspectIntent(input: unknown): Promise<StaffInvitationIntentReadResult> {
    const checked = checkedIntent(input);
    if (!checked) return readResult("invalid_input");

    const { intent, json } = checked;
    let entity: Record<string, unknown>;

    try {
      entity = await this.table.getEntity(
        STAFF_INVITATION_INTENT_PARTITION,
        rowKey(intent.operationId)
      );
    } catch (error) {
      return readResult(statusCode(error) === 404 ? "missing" : "unavailable");
    }

    try {
      if (
        entity.partitionKey !== STAFF_INVITATION_INTENT_PARTITION ||
        entity.rowKey !== rowKey(intent.operationId) ||
        entity.schemaVersion !== 1 ||
        entity.source !== STAFF_INVITATION_INTENT_STORAGE_SOURCE ||
        entity.operationId !== intent.operationId ||
        typeof entity.intentJson !== "string" ||
        Buffer.byteLength(entity.intentJson, "utf8") >
          STAFF_INVITATION_INTENT_MAX_JSON_BYTES
      ) {
        return readResult("contradictory");
      }

      const stored = JSON.parse(entity.intentJson);
      const validated = validateStaffInvitationIntent(stored);

      if (
        validated.status !== "valid" ||
        !validated.intent ||
        serialize(validated.intent) !== entity.intentJson ||
        compareStaffInvitationIntents(
          validated.intent,
          intent
        ).status !== "matching" ||
        serialize(intent) !== json
      ) {
        return readResult("contradictory");
      }

      return readResult("matching_evidence");
    } catch {
      return readResult("contradictory");
    }
  }
}
