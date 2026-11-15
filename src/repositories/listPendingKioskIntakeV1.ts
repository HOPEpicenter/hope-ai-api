import {
  getTableClient
} from "../functions/_shared/tableClient";

const TABLE = "KioskIntakeSubmissions";
const EVENT = "friends-family-2026-11-22";
const SOURCE = "hope_ipad_kiosk_v1";
const MAX_BATCH = 25;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Store = {
  listEntities(options: {
    queryOptions: { filter: string };
  }): AsyncIterable<any>;
};

type Dependencies = {
  enabled?: boolean;
  authorized?: boolean;
  store?: Store;
  limit?: number;
};

export type PendingKioskReviewItem = Readonly<{
  submissionId: string;
  name: string;
  email: string;
  phone: string;
  visitType: string;
  interests: string[];
  invitedBy: string;
  contactConsent: boolean;
  receivedAt: string;
  reviewStatus: "pending";
}>;

export type PendingKioskReviewBatch = Readonly<{
  event: "friends-family-2026-11-22";
  items: PendingKioskReviewItem[];
  limit: number;
  hasMore: boolean;
}>;

function requireString(
  value: unknown,
  maxLength: number
): string {
  if (
    typeof value !== "string" ||
    value.length > maxLength
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_RECORD");
  }

  return value;
}

function projectPendingRow(row: any): PendingKioskReviewItem {
  if (
    !row ||
    row.partitionKey !== EVENT ||
    row.source !== SOURCE ||
    row.reviewStatus !== "pending" ||
    typeof row.rowKey !== "string" ||
    !UUID4.test(row.rowKey) ||
    typeof row.contactConsent !== "boolean"
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_RECORD");
  }

  const interestsRaw = requireString(
    row.interestsJson, 4096
  );

  let interests: unknown;

  try {
    interests = JSON.parse(interestsRaw);
  } catch {
    throw new Error("INVALID_KIOSK_REVIEW_RECORD");
  }

  if (
    !Array.isArray(interests) ||
    interests.length > 30 ||
    interests.some(value =>
      typeof value !== "string" ||
      value.length > 100
    )
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_RECORD");
  }

  const receivedAt = requireString(
    row.receivedAt, 80
  );

  if (!Number.isFinite(Date.parse(receivedAt))) {
    throw new Error("INVALID_KIOSK_REVIEW_RECORD");
  }

  // Explicit projection: never return the raw Azure entity,
  // payload hash, storage metadata or arbitrary new fields.
  return {
    submissionId: row.rowKey,
    name: requireString(row.name, 200),
    email: requireString(row.email, 320),
    phone: requireString(row.phone, 80),
    visitType: requireString(row.visitType, 100),
    interests,
    invitedBy: requireString(row.invitedBy, 200),
    contactConsent: row.contactConsent,
    receivedAt,
    reviewStatus: "pending"
  };
}

/**
 * Trusted, read-only repository primitive.
 *
 * NOT an HTTP authorization boundary.
 * The caller must separately verify Entra administrator
 * authorization before setting authorized: true.
 *
 * No table creation, changes to review status,
 * visitor creation or automated contact.
 *
 * This first-batch primitive does NOT yet offer pagination.
 */
export async function listPendingKioskIntakeV1(
  deps: Dependencies = {}
): Promise<PendingKioskReviewBatch> {
  if (
    deps.enabled !== true ||
    deps.authorized !== true
  ) {
    throw new Error("KIOSK_REVIEW_NOT_AUTHORIZED");
  }

  const limit = deps.limit ?? MAX_BATCH;

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_BATCH
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_LIMIT");
  }

  const store: Store =
    deps.store ?? getTableClient(TABLE);

  const filter =
    `PartitionKey eq '${EVENT}' and ` +
    `reviewStatus eq 'pending'`;

  const items: PendingKioskReviewItem[] = [];
  let hasMore = false;

  // Read at most one row beyond the requested batch
  // to indicate whether further matching records exist.
  // Never log, echo or return unprojected entities.
  for await (const row of store.listEntities({
    queryOptions: { filter }
  })) {
    const item = projectPendingRow(row);

    if (items.length === limit) {
      hasMore = true;
      break;
    }

    items.push(item);
  }

  return {
    event: EVENT,
    items,
    limit,
    hasMore
  };
}