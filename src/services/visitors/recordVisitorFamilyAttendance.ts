import { createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import { isVisitorCheckInRequest } from "./recordVisitorCheckIn";
import type {
  PreparedFamilyAttendance
} from "./prepareVisitorFamilyAttendance";

const CHECK_IN_PARTITION = "VISITOR_CHECK_IN";
const FAMILY_PARTITION = "VISITOR_FAMILY_ATTENDANCE";
const STORAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type AdultReceiptRow = {
  partitionKey: string;
  rowKey: string;
  visitorId: string;
  serviceId: string;
  recordedAt: string;
};

type FamilyRow = {
  partitionKey: string;
  rowKey: string;
  submissionId: string;
  serviceId: string;
  adultVisitorId: string;
  fingerprint: string;
  childrenJson: string;
  purpose: string;
  relationshipStatus: string;
  recordedAt: string;
};

type FamilyTable = Pick<TableClient, "getEntity" | "createEntity">;

export type FamilyAttendanceSaveResult =
  | { status: "saved"; familyAttendanceId: string; replay: boolean }
  | { status:
      "invalid" |
      "adult_check_in_missing" |
      "adult_mismatch" |
      "submission_conflict"
    };

function isMissing(error: unknown): boolean {
  const value = error as { statusCode?: number; code?: string } | null;
  return value?.statusCode === 404 ||
    value?.code === "ResourceNotFound" ||
    value?.code === "EntityNotFound";
}

async function readRow<T extends object>(
  table: FamilyTable,
  partitionKey: string,
  rowKey: string
): Promise<T | null> {
  try {
    return await table.getEntity<T>(partitionKey, rowKey);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function validFamily(input: PreparedFamilyAttendance): boolean {
  if (
    !input ||
    !isVisitorCheckInRequest(input.submissionId, input.serviceId) ||
    typeof input.adultVisitorId !== "string" ||
    !STORAGE_ID.test(input.adultVisitorId) ||
    typeof input.familyAttendanceId !== "string" ||
    !/^family-attendance-[0-9a-f]{32}$/.test(input.familyAttendanceId) ||
    input.guardianDeclaration !== true ||
    input.purpose !== "general_church_attendance" ||
    input.relationshipStatus !== "guardian_declared_unverified" ||
    !Array.isArray(input.children) ||
    input.children.length < 1 ||
    input.children.length > 12
  ) return false;

  const expectedId = "family-attendance-" +
    createHash("sha256")
      .update(JSON.stringify([
        input.submissionId,
        input.serviceId,
        input.adultVisitorId
      ]))
      .digest("hex")
      .slice(0, 32);

  if (input.familyAttendanceId !== expectedId) return false;

  const groups = new Set(["0-2", "3-5", "6-11", "12-17"]);

  return input.children.every(child =>
    child !== null &&
    typeof child === "object" &&
    !Array.isArray(child) &&
    Object.keys(child).length === 2 &&
    Object.keys(child).every(key =>
      key === "firstName" || key === "ageGroup"
    ) &&
    typeof child.firstName === "string" &&
    child.firstName.trim().length > 0 &&
    child.firstName.length <= 60 &&
    !/[\u0000-\u001f\u007f]/.test(child.firstName) &&
    typeof child.ageGroup === "string" &&
    groups.has(child.ageGroup)
  );
}

/**
 * Persist an immutable family attendance group only after checking
 * the canonical adult receipt in the Visitors table.
 *
 * No child profile, household link or pickup permission is created.
 */
export async function recordVisitorFamilyAttendance(
  attendance: PreparedFamilyAttendance,
  dependencies: { table?: FamilyTable } = {}
): Promise<FamilyAttendanceSaveResult> {
  if (!validFamily(attendance)) return { status: "invalid" };

  const table = dependencies.table ?? getTableClient("Visitors");

  const adult = await readRow<AdultReceiptRow>(
    table,
    CHECK_IN_PARTITION,
    attendance.submissionId
  );

  if (!adult) return { status: "adult_check_in_missing" };

  if (
    adult.partitionKey !== CHECK_IN_PARTITION ||
    adult.rowKey !== attendance.submissionId ||
    typeof adult.visitorId !== "string" ||
    typeof adult.serviceId !== "string" ||
    typeof adult.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(adult.recordedAt))
  ) {
    throw new Error("Malformed persisted adult check-in receipt");
  }

  if (
    adult.visitorId !== attendance.adultVisitorId ||
    adult.serviceId !== attendance.serviceId
  ) return { status: "adult_mismatch" };

  const children = attendance.children.map(child => ({
    firstName: child.firstName.trim(),
    ageGroup: child.ageGroup
  }));

  const childrenJson = JSON.stringify(children);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([
      attendance.submissionId,
      attendance.serviceId,
      attendance.adultVisitorId,
      attendance.purpose,
      attendance.relationshipStatus,
      childrenJson
    ]))
    .digest("hex");

  const row: FamilyRow = {
    partitionKey: FAMILY_PARTITION,
    rowKey: attendance.familyAttendanceId,
    submissionId: attendance.submissionId,
    serviceId: attendance.serviceId,
    adultVisitorId: attendance.adultVisitorId,
    fingerprint,
    childrenJson,
    purpose: attendance.purpose,
    relationshipStatus: attendance.relationshipStatus,
    recordedAt: new Date().toISOString()
  };

  function reconcile(existing: FamilyRow): FamilyAttendanceSaveResult {
    if (
      existing.partitionKey !== row.partitionKey ||
      existing.rowKey !== row.rowKey ||
      typeof existing.fingerprint !== "string" ||
      typeof existing.childrenJson !== "string" ||
      typeof existing.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(existing.recordedAt)) ||
      typeof existing.submissionId !== "string" ||
      typeof existing.serviceId !== "string" ||
      typeof existing.adultVisitorId !== "string" ||
      typeof existing.purpose !== "string" ||
      typeof existing.relationshipStatus !== "string"
    ) throw new Error("Malformed persisted family attendance");

    if (
      existing.fingerprint !== fingerprint ||
      existing.childrenJson !== childrenJson ||
      existing.submissionId !== row.submissionId ||
      existing.serviceId !== row.serviceId ||
      existing.adultVisitorId !== row.adultVisitorId ||
      existing.purpose !== row.purpose ||
      existing.relationshipStatus !== row.relationshipStatus
    ) return { status: "submission_conflict" };

    return {
      status: "saved",
      familyAttendanceId: row.rowKey,
      replay: true
    };
  }

  const previous = await readRow<FamilyRow>(
    table, FAMILY_PARTITION, row.rowKey
  );
  if (previous) return reconcile(previous);

  try {
    await table.createEntity(row);
  } catch (error) {
    // A competing writer or lost acknowledgement may have committed.
    // Reconcile the durable row before deciding whether to retry.
    const committed = await readRow<FamilyRow>(
      table, FAMILY_PARTITION, row.rowKey
    );
    if (committed) return reconcile(committed);
    throw error;
  }

  return {
    status: "saved",
    familyAttendanceId: row.rowKey,
    replay: false
  };
}