import {
  normalizePhoneIdentifier
} from "../../functions/_shared/visitorsRepository";

import {
  isVisitorCheckInRequest
} from "./recordVisitorCheckIn";

import {
  validateVisitorFamily,
  type ValidatedVisitorFamily
} from "./validateVisitorFamily";

import {
  resolvePermanentPublicVisitEvent,
  type PermanentPublicVisitContext
} from "./resolvePermanentPublicVisitEvent";

// Confirmed source-backed choices. Final approved UI
// wording and any additional choices remain to be reconciled.
const INTERESTS = [
  "church_events",
  "prayer",
  "small_groups",
  "growing_in_faith"
] as const;

type Interest = typeof INTERESTS[number];

type ChurchHome =
  | "yes"
  | "no"
  | "looking"
  | "prefer_not_to_say";

export type PublicVisitProfile = Readonly<{
  visitType: "first" | "returning";
  churchHome: ChurchHome | null;
  interests: readonly Interest[];
  invitedBy: string | null;
  contactConsent: boolean;
}>;

type AdultCommand = Readonly<{
  submissionId: string;
  serviceId: string;
  name: string;
  email?: string;
  phone?: string;
  profile: PublicVisitProfile;
}>;

type FamilyCommand = AdultCommand & Readonly<{
  family: Pick<
    ValidatedVisitorFamily,
    "guardianName" | "guardianDeclaration" | "children"
  >;
}>;

export type PublicVisitCommand =
  AdultCommand | FamilyCommand;

type PreparationResult =
  | {
      status: "ready";
      command: PublicVisitCommand;
    }
  | {
      status:
        | "invalid"
        | "unavailable"
        | "selection_required";
    };

const ALLOWED = new Set([
  "name",
  "email",
  "phone",
  "visitType",
  "churchHome",
  "interests",
  "invitedBy",
  "contactConsent",
  "eventId",
  "family"
]);

function plainObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function cleanText(
  value: unknown,
  max: number
): string | null {
  if (typeof value !== "string" ||
      value.length > max ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  const normalized = value.normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.length <= max
    ? normalized : null;
}

function isInterest(value: unknown): value is Interest {
  return typeof value === "string" &&
    (INTERESTS as readonly string[]).includes(value);
}

/**
 * Validate the permanent public form before reservation.
 *
 * No storage, communications, visitor identity lookup
 * or follow-up creation occurs in this function.
 */
export function preparePermanentPublicVisitRegistration(
  request: Readonly<{
    submissionId: unknown;
    body: unknown;
  }>,
  context: PermanentPublicVisitContext,
  familyEnabled = false
): PreparationResult {
  try {
    if (context.enabled !== true) {
      return { status: "unavailable" };
    }

    const body = request.body;

    if (!plainObject(body) ||
        Object.keys(body).some(key => !ALLOWED.has(key)) ||
        (body.visitType !== "first" &&
         body.visitType !== "returning") ||
        typeof body.contactConsent !== "boolean") {
      return { status: "invalid" };
    }

    const name = cleanText(body.name, 160);

    const email = cleanText(
      body.email === undefined ? "" : body.email,
      254
    );

    const rawPhone = cleanText(
      body.phone === undefined ? "" : body.phone,
      40
    );

    if (!name ||
        email === null ||
        rawPhone === null ||
        (!email && !rawPhone) ||
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
        (rawPhone && !/^[+0-9(). -]+$/.test(rawPhone))) {
      return { status: "invalid" };
    }

    const phone = rawPhone
      ? normalizePhoneIdentifier(rawPhone)
      : "";

    if (rawPhone && !/^\d{7,15}$/.test(phone)) {
      return { status: "invalid" };
    }

    const interests = body.interests === undefined
      ? []
      : body.interests;

    if (!Array.isArray(interests) ||
        interests.length > INTERESTS.length ||
        !interests.every(isInterest) ||
        new Set(interests).size !== interests.length) {
      return { status: "invalid" };
    }

    const invitedBy = cleanText(
      body.invitedBy === undefined ? "" : body.invitedBy,
      120
    );

    if (invitedBy === null) {
      return { status: "invalid" };
    }

    const churchHome = body.churchHome === undefined
      ? null
      : body.churchHome;

    if (churchHome !== null &&
        churchHome !== "yes" &&
        churchHome !== "no" &&
        churchHome !== "looking" &&
        churchHome !== "prefer_not_to_say") {
      return { status: "invalid" };
    }

    const event = resolvePermanentPublicVisitEvent({
      ...context,
      selectedEventId: body.eventId
    });

    if (event.status === "selection_required") {
      return { status: "selection_required" };
    }

    if (event.status !== "ready") {
      return {
        status: event.status === "invalid_selection"
          ? "invalid" : "unavailable"
      };
    }

    if (typeof request.submissionId !== "string" ||
        !isVisitorCheckInRequest(
          request.submissionId,
          event.serviceId
        )) {
      return { status: "invalid" };
    }

    const adult: AdultCommand = {
      submissionId: request.submissionId,
      serviceId: event.serviceId,
      name,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(phone ? { phone } : {}),
      profile: {
        visitType: body.visitType,
        churchHome,
        interests: [...interests].sort(),
        invitedBy: invitedBy || null,
        contactConsent: body.contactConsent
      }
    };

    if (!Object.prototype.hasOwnProperty.call(body, "family")) {
      return { status: "ready", command: adult };
    }

    if (familyEnabled !== true) {
      return { status: "unavailable" };
    }

    const validated = validateVisitorFamily(body.family);

    if (!validated.valid ||
        validated.family.guardianName
          .normalize("NFC").trim()
          .replace(/\s+/g, " ").toLowerCase() !==
        name.toLowerCase()) {
      return { status: "invalid" };
    }

    return {
      status: "ready",
      command: {
        ...adult,
        family: {
          guardianName: validated.family.guardianName,
          guardianDeclaration: true,
          children: validated.family.children
        }
      }
    };
  } catch {
    return { status: "unavailable" };
  }
}
