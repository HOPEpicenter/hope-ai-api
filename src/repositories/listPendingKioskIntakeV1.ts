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
  }): {
    byPage(options: {
      maxPageSize: number;
      continuationToken?: string;
    }): AsyncIterable<any>;
  };
};

type Dependencies = {
  enabled?: boolean;
  authorized?: boolean;
  store?: Store;
  limit?: number;
  continuationToken?: string;
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
  nextContinuationToken: string | null;
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
 * SDK continuation tokens remain inside trusted server code.
 * The HTTP adapter must never expose these raw tokens.
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

  const continuationToken = deps.continuationToken;

  if (
    continuationToken !== undefined &&
    (
      typeof continuationToken !== "string" ||
      continuationToken.length < 1 ||
      continuationToken.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(continuationToken)
    )
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_CURSOR");
  }

  // Invalid cursors fail before constructing storage dependencies.
  const store: Store =
    deps.store ?? getTableClient(TABLE);

  const filter =
    `PartitionKey eq '${EVENT}' and ` +
    `reviewStatus eq 'pending'`;

  const pages = store.listEntities({
    queryOptions: { filter }
  }).byPage({
    maxPageSize: limit,
    continuationToken
  });

  const iterator = pages[Symbol.asyncIterator]();
  const pageResult = await iterator.next();

  if (pageResult.done) {
    return {
      event: EVENT,
      items: [],
      limit,
      hasMore: false,
      nextContinuationToken: null
    };
  }

  const page = pageResult.value;

  if (
    !Array.isArray(page) ||
    page.length > limit
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_PAGE");
  }

  const items = page.map(projectPendingRow);
  // Azure SDK pages are arrays with additional continuation
  // metadata. Array.isArray narrows the element type to any[],
  // so recover the SDK page metadata explicitly.
  const next = (
    page as any[] & { continuationToken?: unknown }
  ).continuationToken;

  if (
    next !== undefined &&
    next !== null &&
    (
      typeof next !== "string" ||
      next.length < 1 ||
      next.length > 4096 ||
      /[\u0000-\u001f\u007f]/.test(next)
    )
  ) {
    throw new Error("INVALID_KIOSK_REVIEW_CURSOR");
  }

  if (items.length === 0 && next) {
    throw new Error("INVALID_KIOSK_REVIEW_PAGE");
  }

  return {
    event: EVENT,
    items,
    limit,
    hasMore: typeof next === "string",
    nextContinuationToken:
      typeof next === "string" ? next : null
  };
}