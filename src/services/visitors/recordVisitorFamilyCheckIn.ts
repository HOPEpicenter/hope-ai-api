import {
  recordVisitorArrival
} from "./recordVisitorArrival";
import {
  validateVisitorFamily
} from "./validateVisitorFamily";
import {
  prepareVisitorFamilyAttendance,
  type PreparedFamilyAttendance
} from "./prepareVisitorFamilyAttendance";
import {
  recordVisitorFamilyAttendance,
  type FamilyAttendanceSaveResult
} from "./recordVisitorFamilyAttendance";
import type {
  CheckInResult
} from "./recordVisitorCheckIn";

type FamilyCheckInInput = {
  submissionId: string;
  serviceId: string;
  name: string;
  email?: string;
  phone?: string;
  family: unknown;
};

type ArrivalResult =
  | CheckInResult
  | { status: "requires_staff_review" };

type Dependencies = {
  arrival?: (input: Omit<FamilyCheckInInput, "family">) =>
    Promise<ArrivalResult>;
  saveFamily?: (attendance: PreparedFamilyAttendance) =>
    Promise<FamilyAttendanceSaveResult>;
};

export type FamilyCheckInResult =
  | {
      status: "recorded";
      adultVisitorId: string;
      familyAttendanceId: string;
      replay: boolean;
    }
  | {
      status: "invalid" | "requires_staff_review" |
        "visitor_not_found" | "submission_conflict";
    }
  | {
      status: "family_incomplete";
      reason: "storage_unavailable" | "adult_mismatch" |
        "adult_check_in_missing" | "submission_conflict" |
        "invalid";
    };

function normalize(value: string): string {
  return value.normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Internal family arrival coordinator.
 *
 * The adult may be recorded before the family record is committed.
 * In that case the caller receives family_incomplete, never recorded.
 * Retrying the same submission reuses the adult check-in receipt and
 * attempts the immutable family record again.
 *
 * No public route, permanent household link, child visitor profile,
 * childcare permission or automated visitor contact is created here.
 */
export async function recordVisitorFamilyCheckIn(
  input: FamilyCheckInInput,
  dependencies: Dependencies = {}
): Promise<FamilyCheckInResult> {
  const validated = validateVisitorFamily(input.family);

  // Reject invalid family data before any adult attendance write.
  if (!validated.valid ||
      typeof input.name !== "string" ||
      normalize(input.name) !==
        normalize(validated.family.guardianName)) {
    return { status: "invalid" };
  }

  const arrival = dependencies.arrival ?? recordVisitorArrival;
  const saveFamily =
    dependencies.saveFamily ?? recordVisitorFamilyAttendance;

  const adult = await arrival({
    submissionId: input.submissionId,
    serviceId: input.serviceId,
    name: input.name,
    email: input.email,
    phone: input.phone
  });

  if (adult.status !== "recorded") {
    return { status: adult.status };
  }

  const prepared = prepareVisitorFamilyAttendance({
    submissionId: input.submissionId,
    serviceId: input.serviceId,
    adultVisitorId: adult.receipt.visitorId,
    adultName: input.name,
    family: input.family,
    checkIn: adult
  });

  if (prepared.status !== "prepared") {
    return {
      status: "family_incomplete",
      reason: prepared.status === "adult_mismatch"
        ? "adult_mismatch" : "invalid"
    };
  }

  let saved: FamilyAttendanceSaveResult;

  try {
    saved = await saveFamily(prepared.attendance);
  } catch {
    // The adult attendance may already be durable. The caller must
    // not display a complete family check-in confirmation.
    return {
      status: "family_incomplete",
      reason: "storage_unavailable"
    };
  }

  if (saved.status !== "saved") {
    return {
      status: "family_incomplete",
      reason: saved.status
    };
  }

  return {
    status: "recorded",
    adultVisitorId: adult.receipt.visitorId,
    familyAttendanceId: saved.familyAttendanceId,
    replay: saved.replay
  };
}