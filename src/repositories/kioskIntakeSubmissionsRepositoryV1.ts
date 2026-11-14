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

type Dependencies = {
  table?: Store;
  now?: () => string;
  enabled?: boolean;
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

  const assessed = assessKioskIntakeV1(input);

  if (
    !assessed.valid ||
    typeof submissionId !== "string" ||
    !UUID4.test(submissionId)
  ) {
    return { accepted: false, status: "invalid" };
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

  const payloadHash = createHash("sha256")
    .update(canonical)
    .digest("hex");

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
    source: "hope_ipad_kiosk_v1",
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