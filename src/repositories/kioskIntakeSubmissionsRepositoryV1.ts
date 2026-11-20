import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { getTableClient, ensureTable } from "../functions/_shared/tableClient";
import {
  assessKioskIntakeV1
} from "../services/visitors/assessKioskIntakeV1";

const TABLE = "KioskIntakeSubmissions";
const EVENT = "friends-family-2026-11-22";
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Store = {
  createEntity(entity: any): Promise<unknown>;
  getEntity(partitionKey: string, rowKey: string): Promise<any>;
};

export type KioskSubmissionSource =
  | "hope_ipad_kiosk_v1"
  | "hope_guest_qr_v1";

const DEFAULT_SOURCE: KioskSubmissionSource =
  "hope_ipad_kiosk_v1";

function validSource(value: unknown): value is KioskSubmissionSource {
  return value === "hope_ipad_kiosk_v1" ||
    value === "hope_guest_qr_v1";
}

type Dependencies = {
  table?: Store;
  now?: () => string;
  enabled?: boolean;
  source?: KioskSubmissionSource;
};

export type KioskSubmissionReceipt =
  | Readonly<{
      accepted: true;
      status: "recorded" | "already_recorded";
    }>
  | Readonly<{
      accepted: false;
      status:
        | "disabled"
        | "invalid"
        | "idempotency_conflict";
    }>;

function isConflict(error: any): boolean {
  return (
    Number(error?.statusCode ?? error?.status ?? 0) === 409 ||
    error?.code === "EntityAlreadyExists"
  );
}

/**
 * Internal persistence primitive only.
 *
 * This is NOT a public authorization boundary.
 * No HTTP route is registered.
 * No canonical visitor or six-week plan is created.
 */
/**
 * Shared fingerprint for both append and retry inspection.
 * Never return the hash to an HTTP caller.
 */
function fingerprintKioskIntake(input: unknown): string | null {
  const assessed = assessKioskIntakeV1(input);

  if (!assessed.valid) {
    return null;
  }

  const payload = assessed.intake;
  const canonical = JSON.stringify([
    payload.name,
    payload.email.toLowerCase(),
    payload.phone,
    payload.visitType,
    [...payload.interests].sort(),
    payload.invitedBy,
    payload.contactConsent
  ]);

  return createHash("sha256")
    .update(canonical)
    .digest("hex");
}

function isNotFound(error: any): boolean {
  return (
    Number(error?.statusCode ?? error?.status ?? 0) === 404 ||
    error?.code === "ResourceNotFound" ||
    error?.code === "EntityNotFound"
  );
}

export type KioskRetryPreflightResult =
  | "disabled"
  | "invalid"
  | "missing"
  | "already_recorded"
  | "idempotency_conflict";

/**
 * Read-only preflight for completed kiosk retries.
 *
 * This is NOT a public authorization boundary.
 * Call only after verifying the signed device and
 * authoritative active-device registry state.
 *
 * No table creation, writes or visitor data are returned.
 * The final atomic createEntity remains authoritative.
 */
export async function inspectExistingKioskIntakeSubmissionV1(
  input: unknown,
  submissionId: unknown,
  deps: Dependencies = {}
): Promise<KioskRetryPreflightResult> {
  if (deps.enabled !== true) {
    return "disabled";
  }

  const source = deps.source ?? DEFAULT_SOURCE;

  if (!validSource(source)) {
    return "invalid";
  }

  if (
    typeof submissionId !== "string" ||
    !UUID4.test(submissionId)
  ) {
    return "invalid";
  }

  const payloadHash = fingerprintKioskIntake(input);

  if (!payloadHash) {
    return "invalid";
  }

  const table: Store = deps.table ?? getTableClient(TABLE);

  let existing: any;

  try {
    existing = await table.getEntity(EVENT, submissionId);
  } catch (error) {
    if (isNotFound(error)) {
      return "missing";
    }

    // Unknown storage errors are not proof of absence.
    throw error;
  }

  if (
    existing?.payloadHash === payloadHash &&
    existing?.source === source &&
    existing?.partitionKey === EVENT &&
    existing?.rowKey === submissionId
  ) {
    return "already_recorded";
  }

  return "idempotency_conflict";
}
export async function appendKioskIntakeSubmissionV1(
  input: unknown,
  submissionId: unknown,
  deps: Dependencies = {}
): Promise<KioskSubmissionReceipt> {
  // A process environment setting alone must never enable writes.
  // Only a separately trusted service boundary may explicitly enable
  // this internal persistence primitive after its own checks pass.
  if (deps.enabled !== true) {
    return { accepted: false, status: "disabled" };
  }

  const source = deps.source ?? DEFAULT_SOURCE;

  if (!validSource(source)) {
    return { accepted: false, status: "invalid" };
  }

  const assessed = assessKioskIntakeV1(input);

  if (
    !assessed.valid ||
    typeof submissionId !== "string" ||
    !UUID4.test(submissionId)
  ) {
    return { accepted: false, status: "invalid" };
  }

  const payload = assessed.intake;
  const payloadHash = fingerprintKioskIntake(input);

  if (!payloadHash) {
    return { accepted: false, status: "invalid" };
  }

  const table: Store = deps.table ?? getTableClient(TABLE);

  if (!deps.table) {
    await ensureTable(table as TableClient);
  }

  const occurredAt = (deps.now ?? (() => new Date().toISOString()))();

  if (
    typeof occurredAt !== "string" ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    throw new Error("INVALID_SERVER_TIME");
  }

  const entity = {
    partitionKey: EVENT,
    rowKey: submissionId,
    payloadHash,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    visitType: payload.visitType,
    interestsJson: JSON.stringify(payload.interests),
    invitedBy: payload.invitedBy,
    contactConsent: payload.contactConsent,
    receivedAt: occurredAt,
    source,
    reviewStatus: "pending"
  };

  try {
    await table.createEntity(entity);
    return { accepted: true, status: "recorded" };
  } catch (error: any) {
    if (!isConflict(error)) throw error;

    // A conflict is not proof that our submission succeeded.
    // Read the exact durable row and verify the payload binding.
    const existing = await table.getEntity(EVENT, submissionId);

    if (
      existing?.payloadHash === payloadHash &&
      existing?.source === entity.source &&
      existing?.partitionKey === EVENT &&
      existing?.rowKey === submissionId
    ) {
      return { accepted: true, status: "already_recorded" };
    }

    return { accepted: false, status: "idempotency_conflict" };
  }
}