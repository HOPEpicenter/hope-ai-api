import { getTableClient } from "../../functions/_shared/tableClient";
import {
  createVisitorRecord
} from "../../functions/_shared/visitorsRepository";
import {
  mapKioskIntakeToVisitor
} from "./mapKioskIntakeToVisitor";

const TABLE = "KioskIntakeSubmissions";
const EVENT = "friends-family-2026-11-22";
const SOURCE = "hope_ipad_kiosk_v1";

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type KioskTable = {
  getEntity(partitionKey: string, rowKey: string): Promise<any>;
  updateEntity(
    entity: any,
    mode: "Merge",
    options: { etag: string }
  ): Promise<unknown>;
};

type CreateCanonicalVisitor = typeof createVisitorRecord;

type Dependencies = {
  table?: KioskTable;
  createVisitor?: CreateCanonicalVisitor;
};

type Input = Readonly<{
  submissionId: string;
  enabled: true;
  administratorAuthorized: true;
}>;

export type ReconciliationResult =
  | Readonly<{
      status: "imported";
      visitorId: string;
      eligibleForStaffFollowup: boolean;
      requiresVisitHistoryReview: boolean;
    }>
  | Readonly<{
      status:
        | "not_authorized"
        | "invalid"
        | "already_claimed"
        | "manual_recovery_required";
    }>;

/**
 * Trusted server-side reconciliation operation.
 *
 * Not an HTTP authorization boundary.
 * An authenticated administrator endpoint must verify
 * real actor authority before passing administratorAuthorized.
 *
 * The browser must never control these trusted flags.
 */
export async function reconcileKioskVisitor(
  input: Input,
  dependencies: Dependencies = {}
): Promise<ReconciliationResult> {
  if (
    input?.enabled !== true ||
    input?.administratorAuthorized !== true
  ) {
    return { status: "not_authorized" };
  }

  if (
    typeof input.submissionId !== "string" ||
    !UUID4.test(input.submissionId)
  ) {
    return { status: "invalid" };
  }

  const table: KioskTable =
    dependencies.table ?? getTableClient(TABLE);

  const row = await table.getEntity(
    EVENT,
    input.submissionId
  );

  if (
    row?.partitionKey !== EVENT ||
    row?.rowKey !== input.submissionId ||
    row?.source !== SOURCE ||
    row?.reviewStatus !== "pending" ||
    typeof row.etag !== "string" ||
    row.etag.length === 0
  ) {
    return { status: "already_claimed" };
  }

  const mapped = mapKioskIntakeToVisitor({
    submissionId: row.rowKey,
    name: row.name,
    email: row.email,
    phone: row.phone,
    visitType: row.visitType,
    contactConsent: row.contactConsent,
    reviewStatus: row.reviewStatus
  });

  // Conditional claim prevents concurrent double imports.
  // Never perform a visitor write before a durable claim.
  try {
    await table.updateEntity({
      partitionKey: EVENT,
      rowKey: input.submissionId,
      reviewStatus: "importing"
    }, "Merge", { etag: row.etag });
  } catch (error: any) {
    if (
      Number(error?.statusCode ?? error?.status) === 412 ||
      Number(error?.statusCode ?? error?.status) === 409
    ) {
      return { status: "already_claimed" };
    }

    throw error;
  }

  // From this point, unknown failures require staff recovery.
  // Do not blindly retry a partially completed import.
  try {
    const create =
      dependencies.createVisitor ?? createVisitorRecord;

    const result = await create(mapped.visitor);

    const claimed = await table.getEntity(
      EVENT,
      input.submissionId
    );

    if (
      claimed?.reviewStatus !== "importing" ||
      claimed?.partitionKey !== EVENT ||
      claimed?.rowKey !== input.submissionId ||
      typeof claimed.etag !== "string" ||
      !claimed.etag
    ) {
      return { status: "manual_recovery_required" };
    }

    await table.updateEntity({
      partitionKey: EVENT,
      rowKey: input.submissionId,
      reviewStatus: "imported",
      canonicalVisitorId: result.visitor.visitorId
    }, "Merge", { etag: claimed.etag });

    return {
      status: "imported",
      visitorId: result.visitor.visitorId,
      eligibleForStaffFollowup:
        mapped.eligibleForStaffFollowup,
      requiresVisitHistoryReview:
        mapped.requiresVisitHistoryReview
    };
  } catch {
    // A canonical visitor might already exist even if the
    // final kiosk status update failed.
    return { status: "manual_recovery_required" };
  }
}
