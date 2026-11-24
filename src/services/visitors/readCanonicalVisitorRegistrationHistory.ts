import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const MAX_RECEIPTS = 2000;
const HISTORY_LIMIT = 20;

const CHURCH_HOME = [
  "yes",
  "no",
  "looking",
  "prefer_not_to_say"
];

const INTERESTS = [
  "church_events",
  "prayer",
  "small_groups",
  "growing_in_faith"
];

const PROFILE_KEYS = [
  "version",
  "name",
  "email",
  "phone",
  "visitType",
  "churchHome",
  "interests",
  "invitedBy",
  "contactConsent"
];

export type VisitorRegistrationHistoryItem = {
  submissionId: string;
  serviceId: string;
  recordedAt: string;
  visitType: "first" | "returning";
  churchHome: string | null;
  interests: string[];
  invitedBy: string | null;
  contactConsentAtRegistration: boolean;
};

export type VisitorRegistrationHistoryResult =
  | {
      status: "ready";
      registrationCount: number;
      truncated: boolean;
      items: VisitorRegistrationHistoryItem[];
    }
  | {
      status: "unavailable";
    };

type Receipt = {
  visitorId: string;
  serviceId: string;
  recordedAt: string;
  registrationDetailsJson?: string;
};

function safeText(
  value: unknown,
  maximum: number
): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function parseProfile(
  raw: unknown
): Omit<
  VisitorRegistrationHistoryItem,
  "submissionId" | "serviceId" | "recordedAt"
> {
  if (
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > 8192
  ) {
    throw new Error("Invalid registration evidence");
  }

  const parsed: unknown = JSON.parse(raw);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("Invalid registration evidence");
  }

  const p = parsed as Record<string, unknown>;

  if (
    Object.keys(p).length !== PROFILE_KEYS.length ||
    !PROFILE_KEYS.every(key =>
      Object.prototype.hasOwnProperty.call(p, key)
    ) ||
    p.version !== 1 ||
    !safeText(p.name, 160) ||
    (p.email !== null && !safeText(p.email, 254)) ||
    (p.phone !== null && !safeText(p.phone, 40)) ||
    (p.email === null && p.phone === null) ||
    (p.visitType !== "first" &&
      p.visitType !== "returning") ||
    (
      p.churchHome !== null &&
      (
        typeof p.churchHome !== "string" ||
        !CHURCH_HOME.includes(p.churchHome)
      )
    ) ||
    (
      p.invitedBy !== null &&
      !safeText(p.invitedBy, 120)
    ) ||
    typeof p.contactConsent !== "boolean" ||
    !Array.isArray(p.interests) ||
    p.interests.length > INTERESTS.length ||
    !p.interests.every(value =>
      typeof value === "string" &&
      INTERESTS.includes(value)
    ) ||
    new Set(p.interests).size !== p.interests.length
  ) {
    throw new Error("Invalid registration evidence");
  }

  return {
    visitType: p.visitType,
    churchHome: p.churchHome as string | null,
    interests: [...p.interests],
    invitedBy: p.invitedBy as string | null,
    contactConsentAtRegistration: p.contactConsent
  };
}

/**
 * Internal read-only projection of canonical receipts.
 * Does not expose historical contact details, admission
 * credentials, raw storage entities or current consent.
 * Authorization must precede any future HTTP exposure.
 */
export async function readCanonicalVisitorRegistrationHistory(
  visitorId: string,
  table?: Pick<TableClient, "listEntities">
): Promise<VisitorRegistrationHistoryResult> {
  if (
    typeof visitorId !== "string" ||
    !ID.test(visitorId)
  ) {
    return { status: "unavailable" };
  }

  try {
    const client =
      table ?? getTableClient("Visitors");

    const filter =
      "PartitionKey eq 'VISITOR_CHECK_IN' " +
      `and visitorId eq '${visitorId}'`;

    const items: VisitorRegistrationHistoryItem[] = [];
    const seen = new Set<string>();

    let scanned = 0;

    for await (
      const row of client.listEntities<Receipt>({
        queryOptions: { filter }
      })
    ) {
      if (
        ++scanned > MAX_RECEIPTS ||
        row.partitionKey !== "VISITOR_CHECK_IN" ||
        row.visitorId !== visitorId ||
        typeof row.rowKey !== "string" ||
        !UUID4.test(row.rowKey) ||
        seen.has(row.rowKey)
      ) {
        return { status: "unavailable" };
      }

      seen.add(row.rowKey);

      // Historical non-public check-ins are not
      // presented as permanent registrations.
      if (row.registrationDetailsJson === undefined) {
        continue;
      }

      if (
        typeof row.serviceId !== "string" ||
        !ID.test(row.serviceId) ||
        typeof row.recordedAt !== "string" ||
        !Number.isFinite(Date.parse(row.recordedAt)) ||
        new Date(row.recordedAt).toISOString() !==
          row.recordedAt
      ) {
        return { status: "unavailable" };
      }

      items.push({
        submissionId: row.rowKey,
        serviceId: row.serviceId,
        recordedAt: row.recordedAt,
        ...parseProfile(row.registrationDetailsJson)
      });
    }

    items.sort((left, right) =>
      right.recordedAt.localeCompare(left.recordedAt) ||
      left.submissionId.localeCompare(right.submissionId)
    );

    return {
      status: "ready",
      registrationCount: items.length,
      truncated: items.length > HISTORY_LIMIT,
      items: items.slice(0, HISTORY_LIMIT)
    };
  } catch {
    // Never return a misleading partial history.
    return { status: "unavailable" };
  }
}
