/**
 * Friends & Family Day visitor reconciliation.
 *
 * Pure mapping only. No database writes, staff authorization,
 * six-week plan creation, or automated visitor contact.
 */
export type ReviewedKioskSubmission = Readonly<{
  submissionId: string;
  name: string;
  email: string;
  phone: string;
  visitType: string;
  contactConsent: boolean;
  reviewStatus: "pending";
}>;

export type KioskVisitorReconciliation = Readonly<{
  submissionId: string;
  visitor: {
    name: string;
    email: string;
    phone: string;
  };
  firstVisitDate: "2026-11-22";
  eligibleForStaffFollowup: boolean;
  requiresAuthorizedStaffReview: true;
}>;

export function mapKioskIntakeToVisitor(
  submission: ReviewedKioskSubmission
): KioskVisitorReconciliation {
  if (
    !submission ||
    submission.reviewStatus !== "pending" ||
    typeof submission.submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      submission.submissionId
    ) ||
    typeof submission.name !== "string" ||
    typeof submission.email !== "string" ||
    typeof submission.phone !== "string" ||
    typeof submission.contactConsent !== "boolean"
  ) {
    throw new Error("INVALID_KIOSK_RECONCILIATION_INPUT");
  }

  const name = submission.name.trim();
  const email = submission.email.trim();
  const phone = submission.phone.trim();

  if (
    !name ||
    name.length > 120 ||
    email.length > 254 ||
    phone.length > 40 ||
    (!email && !phone)
  ) {
    throw new Error("INVALID_KIOSK_RECONCILIATION_INPUT");
  }

  // Match the existing kiosk intake contact validation.
  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("INVALID_KIOSK_RECONCILIATION_INPUT");
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "");

    if (
      !/^[0-9+().\s-]+$/.test(phone) ||
      digits.length < 10 ||
      digits.length > 15
    ) {
      throw new Error("INVALID_KIOSK_RECONCILIATION_INPUT");
    }
  }

  return {
    submissionId: submission.submissionId,
    visitor: { name, email, phone },
    firstVisitDate: "2026-11-22",
    eligibleForStaffFollowup: submission.contactConsent,
    requiresAuthorizedStaffReview: true
  };
}
