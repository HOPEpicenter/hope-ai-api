/**
 * HOPE Friends & Family visitor kiosk intake V1.
 *
 * Pure validation only:
 * - No HTTP route
 * - No database writes
 * - No staff authentication bypass
 * - No automatic communication
 * - No six-week follow-up activation
 *
 * Values supplied by a kiosk are untrusted.
 */

export type KioskIntake = Readonly<{
  name: string;
  email: string;
  phone: string;
  visitType: "first" | "returning";
  interests: readonly string[];
  invitedBy: string;
  contactConsent: boolean;
}>;

export type KioskIntakeAssessment =
  | Readonly<{
      valid: true;
      intake: KioskIntake;
      submissionAuthorized: false;
      followupAuthorized: false;
    }>
  | Readonly<{
      valid: false;
      reason: string;
      submissionAuthorized: false;
      followupAuthorized: false;
    }>;

const ALLOWED_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "visitType",
  "interests",
  "invitedBy",
  "contactConsent"
]);

const ALLOWED_INTERESTS = new Set([
  "church_events",
  "prayer",
  "small_groups",
  "growing_in_faith"
]);

function fail(reason: string): KioskIntakeAssessment {
  return {
    valid: false,
    reason,
    submissionAuthorized: false,
    followupAuthorized: false
  };
}

function plainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function optionalText(
  value: unknown,
  maxLength: number
): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string") return null;

  const text = value.trim();

  return text.length <= maxLength ? text : null;
}

/**
 * This function does not grant permission to persist data.
 * A separately reviewed backend boundary must authenticate
 * the submission, control abuse, and record consent.
 */
export function assessKioskIntakeV1(
  input: unknown
): KioskIntakeAssessment {
  if (!plainObject(input)) {
    return fail("INVALID_BODY");
  }

  if (Object.keys(input).some(
    key => !ALLOWED_FIELDS.has(key)
  )) {
    return fail("UNEXPECTED_FIELD");
  }

  const name = optionalText(input.name, 120);
  const email = optionalText(input.email, 254);
  const phone = optionalText(input.phone, 40);
  const invitedBy = optionalText(input.invitedBy, 120);

  if (!name || email === null ||
      phone === null || invitedBy === null) {
    return fail("INVALID_CONTACT_FIELDS");
  }

  if (!email && !phone) {
    return fail("CONTACT_METHOD_REQUIRED");
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return fail("INVALID_EMAIL");
  }

  if (phone) {
    if (!/^[0-9+().\s-]+$/.test(phone)) {
      return fail("INVALID_PHONE");
    }

    const digits = phone.replace(/\D/g, "");

    if (digits.length < 10 || digits.length > 15) {
      return fail("INVALID_PHONE");
    }
  }

  if (
    input.visitType !== "first" &&
    input.visitType !== "returning"
  ) {
    return fail("INVALID_VISIT_TYPE");
  }

  if (typeof input.contactConsent !== "boolean") {
    return fail("EXPLICIT_CONSENT_REQUIRED");
  }

  if (
    !Array.isArray(input.interests) ||
    input.interests.length > 4 ||
    !input.interests.every(
      value =>
        typeof value === "string" &&
        ALLOWED_INTERESTS.has(value)
    ) ||
    new Set(input.interests).size !== input.interests.length
  ) {
    return fail("INVALID_INTERESTS");
  }

  return {
    valid: true,
    intake: {
      name,
      email,
      phone,
      visitType: input.visitType,
      interests: [...input.interests],
      invitedBy,
      contactConsent: input.contactConsent
    },
    submissionAuthorized: false,
    followupAuthorized: false
  };
}