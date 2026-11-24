import { createHash } from "node:crypto";
import {
  validateVisitorFamily,
  type ValidatedVisitorFamily
} from "./validateVisitorFamily";
import type { CheckInResult } from "./recordVisitorCheckIn";

export type PreparedFamilyAttendance = {
  familyAttendanceId: string;
  submissionId: string;
  serviceId: string;
  adultVisitorId: string;
  guardianDeclaration: true;
  children: ValidatedVisitorFamily["children"];
  purpose: "general_church_attendance";
  relationshipStatus: "guardian_declared_unverified";
};

export type PrepareFamilyAttendanceResult =
  | { status: "prepared"; attendance: PreparedFamilyAttendance }
  | { status: "invalid" | "check_in_not_recorded" | "adult_mismatch" };

function normalizedName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Prepare a family attendance group only after an adult check-in
 * receipt has been confirmed.
 *
 * This does not create canonical child identities, household
 * membership, custody permissions, or childcare pickup rights.
 */
export function prepareVisitorFamilyAttendance(input: {
  submissionId: string;
  serviceId: string;
  adultVisitorId: string;
  adultName: string;
  family: unknown;
  checkIn: CheckInResult;
}): PrepareFamilyAttendanceResult {
  const family = validateVisitorFamily(input.family);

  if (!family.valid) {
    return { status: "invalid" };
  }

  if (!input.checkIn || input.checkIn.status !== "recorded") {
    return { status: "check_in_not_recorded" };
  }

  const receipt = input.checkIn.receipt;

  if (
    receipt.submissionId !== input.submissionId ||
    receipt.serviceId !== input.serviceId ||
    receipt.visitorId !== input.adultVisitorId
  ) {
    return { status: "adult_mismatch" };
  }

  if (
    typeof input.adultName !== "string" ||
    normalizedName(input.adultName) !==
      normalizedName(family.family.guardianName)
  ) {
    return { status: "adult_mismatch" };
  }

  // Deterministic receipt-scoped identifier. No names or contacts
  // appear in the identifier; this is not a household identity.
  const familyAttendanceId = "family-attendance-" +
    createHash("sha256")
      .update(JSON.stringify([
        receipt.submissionId,
        receipt.serviceId,
        receipt.visitorId
      ]))
      .digest("hex")
      .slice(0, 32);

  return {
    status: "prepared",
    attendance: {
      familyAttendanceId,
      submissionId: receipt.submissionId,
      serviceId: receipt.serviceId,
      adultVisitorId: receipt.visitorId,
      guardianDeclaration: true,
      children: family.family.children.map(child => ({ ...child })),
      purpose: "general_church_attendance",
      relationshipStatus: "guardian_declared_unverified"
    }
  };
}