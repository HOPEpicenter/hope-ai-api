import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import type { VisitorFamilyChild } from "./validateVisitorFamily";
import {
  readCanonicalVisitorRegistrationHistory,
  type VisitorRegistrationHistoryItem
} from "./readCanonicalVisitorRegistrationHistory";

type FamilyEvidence =
  | { status: "not_confirmed" }
  | {
      status: "recorded";
      recordedAt: string;
      childCount: number;
      children: VisitorFamilyChild[];
      purpose: "general_church_attendance";
      relationshipStatus: "guardian_declared_unverified";
    };

type FamilyHistoryItem = VisitorRegistrationHistoryItem & {
  familyAttendance: FamilyEvidence;
};

export type VisitorRegistrationFamilyHistoryResult =
  | {
      status: "ready";
      registrationCount: number;
      truncated: boolean;
      items: FamilyHistoryItem[];
    }
  | { status: "unavailable" };

type FamilyReadTable = Pick<TableClient, "listEntities">;

type FamilyRow = {
  submissionId: string;
  serviceId: string;
  adultVisitorId: string;
  fingerprint: string;
  childrenJson: string;
  purpose: string;
  relationshipStatus: string;
  recordedAt: string;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PARTITION = "VISITOR_FAMILY_ATTENDANCE";
const PURPOSE = "general_church_attendance";
const RELATIONSHIP = "guardian_declared_unverified";
const AGE_GROUPS = new Set(["0-2", "3-5", "6-11", "12-17"]);

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseChildren(raw: unknown): VisitorFamilyChild[] {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 8192) {
    throw new Error("Invalid family evidence");
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 12) {
    throw new Error("Invalid family evidence");
  }
  const children: VisitorFamilyChild[] = parsed.map((child: unknown) => {
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      throw new Error("Invalid child evidence");
    }
    const c = child as Record<string, unknown>;
    if (Object.keys(c).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(c, "firstName") ||
        !Object.prototype.hasOwnProperty.call(c, "ageGroup") ||
        typeof c.firstName !== "string" || c.firstName.length < 1 ||
        c.firstName.length > 60 || c.firstName.trim() !== c.firstName ||
        /[\u0000-\u001f\u007f]/.test(c.firstName) ||
        typeof c.ageGroup !== "string" || !AGE_GROUPS.has(c.ageGroup)) {
      throw new Error("Invalid child evidence");
    }
    return { firstName: c.firstName, ageGroup: c.ageGroup as VisitorFamilyChild["ageGroup"] };
  });
  if (JSON.stringify(children) !== raw) throw new Error("Noncanonical family evidence");
  return children;
}

export async function readFamily(
  table: FamilyReadTable,
  visitorId: string,
  receipt: Pick<VisitorRegistrationHistoryItem, "submissionId" | "serviceId">
): Promise<FamilyEvidence> {
  const identity = [receipt.submissionId, receipt.serviceId, visitorId];
  const rowKey = "family-attendance-" + digest(identity).slice(0, 32);
  // An exact-key query distinguishes successful absence from a
  // storage failure without relying on SDK-specific error codes.
  const filter = `PartitionKey eq '${PARTITION}' and RowKey eq '${rowKey}'`;
  let row: (FamilyRow & { partitionKey?: string; rowKey?: string }) | undefined;
  for await (const candidate of table.listEntities<FamilyRow>({
    queryOptions: { filter }
  })) {
    if (row !== undefined || candidate.partitionKey !== PARTITION ||
        candidate.rowKey !== rowKey) {
      throw new Error("Unexpected family query evidence");
    }
    row = candidate;
  }
  if (row === undefined) return { status: "not_confirmed" };
  if (row.partitionKey !== PARTITION || row.rowKey !== rowKey ||
      row.adultVisitorId !== visitorId || row.submissionId !== receipt.submissionId ||
      row.serviceId !== receipt.serviceId || row.purpose !== PURPOSE ||
      row.relationshipStatus !== RELATIONSHIP || typeof row.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(row.recordedAt)) ||
      new Date(row.recordedAt).toISOString() !== row.recordedAt ||
      typeof row.childrenJson !== "string" ||
      Buffer.byteLength(row.childrenJson, "utf8") > 8192 ||
      row.fingerprint !== digest([...identity, PURPOSE, RELATIONSHIP, row.childrenJson])) {
    throw new Error("Invalid linked family evidence");
  }
  const children = parseChildren(row.childrenJson);
  return {
    status: "recorded", recordedAt: row.recordedAt,
    childCount: children.length, children,
    purpose: PURPOSE, relationshipStatus: RELATIONSHIP
  };
}

/** Internal read only. Requires an authorized staff boundary before exposure.
 * Only the existing bounded public registration history is enriched.
 * Missing family evidence is not proof of individual attendance.
 * The unkeyed fingerprint is a consistency check, not authentication.
 */
export async function readCanonicalVisitorRegistrationFamilyHistory(
  visitorId: string,
  table?: FamilyReadTable
): Promise<VisitorRegistrationFamilyHistoryResult> {
  if (typeof visitorId !== "string" || !ID.test(visitorId)) {
    return { status: "unavailable" };
  }
  try {
    const client = table ?? getTableClient("Visitors");
    const history = await readCanonicalVisitorRegistrationHistory(visitorId, client);
    if (history.status !== "ready") return { status: "unavailable" };
    const items: FamilyHistoryItem[] = [];
    // At most 20 exact point reads; no broad family partition scan.
    for (const item of history.items) {
      items.push({ ...item, familyAttendance: await readFamily(client, visitorId, item) });
    }
    return { ...history, items };
  } catch {
    return { status: "unavailable" };
  }
}
