import type { StaffEvent } from "../domain/staff/projectStaffDirectory";
import { normalizeEntraStaffBinding } from
  "../domain/staff/projectStaffDirectory";
import {
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "./staffEventsRepository";

/**
 * Independent historical creation evidence inspection.
 *
 * Exactly three injected entity reads at most.
 * No live TableClient, write, recovery, retries, or OAuth.
 *
 * This is not an atomic snapshot and is never a
 * production authorization or writer-fencing decision.
 */
export interface StaffCreationEvidenceReadPort {
  getEntity(partitionKey: string, rowKey: string): Promise<unknown>;
}

export type StaffCreationEvidence = Readonly<{
  status:
    | "observed_creation"
    | "absent_or_unavailable"
    | "inconsistent";
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionWriterFenced: false;
  authoritative: false;
}>;

function outcome(
  status: StaffCreationEvidence["status"]
): StaffCreationEvidence {
  return Object.freeze({
    status,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    productionWriterFenced: false,
    authoritative: false
  });
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validEvent(value: unknown): value is StaffEvent {
  try {
    const event = record(value);
    if (!event ||
        event.type !== "staff.created" ||
        !identifier(event.staffId) ||
        !identifier(event.eventId) ||
        !identifier(event.actorId) ||
        typeof event.occurredAt !== "string" ||
        event.occurredAt.length > 64 ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        new Date(event.occurredAt).toISOString() !== event.occurredAt) {
      return false;
    }

    const data = record(event.data);
    if (!data ||
        typeof data.displayName !== "string" ||
        !data.displayName.trim() ||
        data.displayName !== data.displayName.trim() ||
        data.status !== "active") {
      return false;
    }

    const binding = normalizeEntraStaffBinding(
      data.entraTenantId,
      data.entraObjectId
    );

    if (!binding ||
        data.entraTenantId !== binding.entraTenantId ||
        data.entraObjectId !== binding.entraObjectId) {
      return false;
    }

    return Buffer.byteLength(JSON.stringify(data), "utf8") <= 16384;
  } catch {
    return false;
  }
}

function isMissing(error: unknown): boolean {
  return record(error)?.statusCode === 404;
}

function storedEventMatches(
  stored: Record<string, unknown>,
  expected: StaffEvent
): boolean {
  if (stored.eventId !== expected.eventId ||
      stored.staffId !== expected.staffId ||
      stored.actorId !== expected.actorId ||
      stored.type !== expected.type ||
      stored.occurredAt !== expected.occurredAt ||
      typeof stored.dataJson !== "string") {
    return false;
  }

  try {
    const parsed = JSON.parse(stored.dataJson);
    return record(parsed) !== null &&
      JSON.stringify(parsed) === JSON.stringify(expected.data);
  } catch {
    return false;
  }
}

/**
 * Read-only, default-disabled evidence reader.
 * Historical creation evidence does not imply active status,
 * current binding ownership, or cross-partition consistency.
 */
export async function inspectStaffCreationEvidence(
  event: unknown,
  port: StaffCreationEvidenceReadPort,
  prototypeEnabled = false
): Promise<StaffCreationEvidence> {
  if (prototypeEnabled !== true ||
      !validEvent(event) ||
      !port ||
      typeof port.getEntity !== "function") {
    return outcome("inconsistent");
  }

  const partition = event.staffId;

  const keys = [
    STAFF_SECURITY_METADATA_HEAD,
    `${event.occurredAt}__${event.eventId}`,
    `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
  ];

  const values: Record<string, unknown>[] = [];

  for (const key of keys) {
    let value: unknown;

    try {
      value = await port.getEntity(partition, key);
    } catch (error) {
      // A missing entity and a temporarily unavailable
      // storage read cannot independently prove absence.
      // Neither condition authorizes a retry or a write.
      void isMissing(error);
      return outcome("absent_or_unavailable");
    }

    const entity = record(value);
    if (!entity) return outcome("inconsistent");

    if (entity.partitionKey !== partition ||
        entity.rowKey !== key) {
      return outcome("inconsistent");
    }

    values.push(entity);
  }

  const [head, storedEvent, receipt] = values;

  if (!Number.isSafeInteger(head.revision) ||
      typeof head.revision !== "number" ||
      head.revision < 0 ||
      (head.state !== "active" && head.state !== "revoked")) {
    return outcome("inconsistent");
  }

  if (!storedEventMatches(storedEvent, event)) {
    return outcome("inconsistent");
  }

  if (receipt.eventId !== event.eventId ||
      receipt.staffId !== event.staffId ||
      receipt.kind !== "staff.creation.prototype" ||
      receipt.revision !== 0) {
    return outcome("inconsistent");
  }

  // This only shows matching historical creation artifacts.
  // Head revision may have advanced after creation.
  // Sequential reads are not an atomic storage snapshot.
  return outcome("observed_creation");
}