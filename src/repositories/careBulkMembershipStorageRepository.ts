import type { TableClient } from "@azure/data-tables";
import {
  parseCareBulkMembershipIntent,
  type CareBulkMembershipIntent
} from "../services/authorization/careBulkRequestMembershipContract";

/**
 * Advisory-only, isolated durable membership prototype.
 *
 * Caller owns the injected TableClient and table lifecycle.
 * No production writer integration, automatic replay, or recovery.
 */
export const CARE_BULK_MEMBERSHIP_PARTITION =
  "care-bulk-membership-v1";

const MAX_PAYLOAD_BYTES = 48 * 1024;

export type CareBulkMembershipStorageStatus =
  | "committed"
  | "already_present"
  | "conflict"
  | "invalid_input"
  | "oversized"
  | "uncertain";

export type CareBulkMembershipStorageResult = Readonly<{
  status: CareBulkMembershipStorageStatus;
  durableMembershipVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  durableMembershipVerified: false,
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function result(
  status: CareBulkMembershipStorageStatus
): CareBulkMembershipStorageResult {
  return { status, ...safety };
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(
      error, "statusCode"
    );
    return descriptor && "value" in descriptor &&
      typeof descriptor.value === "number"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function serialize(intent: CareBulkMembershipIntent): string {
  return JSON.stringify({
    requestId: intent.requestId,
    kind: intent.kind,
    assigneeId: intent.assigneeId,
    visitorIds: [...intent.visitorIds]
  });
}

/**
 * This is a create-only evidence writer.
 *
 * A confirmed create does not imply a visitor assignment happened.
 * A 409 collision is never interpreted as safe idempotent replay.
 * Ambiguous transport failures are never retried automatically.
 */
export class CareBulkMembershipStorageRepository {
  constructor(private readonly table: TableClient) {}

  async recordIntent(input: unknown): Promise<CareBulkMembershipStorageResult> {
    const parsed = parseCareBulkMembershipIntent(input);

    if (!parsed.intent) {
      return result("invalid_input");
    }

    const intent = parsed.intent;
    const payload = serialize(intent);

    if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
      return result("oversized");
    }

    try {
      await this.table.createEntity({
        partitionKey: CARE_BULK_MEMBERSHIP_PARTITION,
        rowKey: intent.requestId,
        requestId: intent.requestId,
        membershipJson: payload,
        schemaVersion: 1
      });

      return result("committed");
    } catch (error) {
      if (statusCode(error) === 409) {
        // Collision never proves matching membership or safe replay.
        return result("conflict");
      }

      return result("uncertain");
    }
  }

  /**
   * Existence inspection is not proof of complete historical writer
   * participation. A stored request cannot authorize execution.
   */
  async inspectIntent(
    requestId: unknown
  ): Promise<CareBulkMembershipStorageResult> {
    if (typeof requestId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) {
      return result("invalid_input");
    }

    try {
      const entity = await this.table.getEntity(
        CARE_BULK_MEMBERSHIP_PARTITION,
        requestId
      );

      if (entity.partitionKey !== CARE_BULK_MEMBERSHIP_PARTITION ||
          entity.rowKey !== requestId ||
          entity.requestId !== requestId ||
          entity.schemaVersion !== 1 ||
          typeof entity.membershipJson !== "string" ||
          Buffer.byteLength(entity.membershipJson, "utf8") >
            MAX_PAYLOAD_BYTES) {
        return result("conflict");
      }

      const stored = JSON.parse(entity.membershipJson);
      const parsed = parseCareBulkMembershipIntent(stored);

      if (!parsed.intent || parsed.intent.requestId !== requestId ||
          serialize(parsed.intent) !== entity.membershipJson) {
        return result("conflict");
      }

      return result("already_present");
    } catch {
      // Missing, malformed, or unreadable evidence never authorizes.
      return result("uncertain");
    }
  }
}
