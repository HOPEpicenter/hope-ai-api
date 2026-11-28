import {
  assessPermanentVisitorAdmissionEvent,
  type PermanentVisitorAdmissionPolicy,
  type PermanentVisitorAdmissionEventResult
} from "./assessPermanentVisitorAdmissionEvent";

import {
  validateVisitorFamily,
  type ValidatedVisitorFamily
} from "./validateVisitorFamily";

import type { VisitorEvent } from "./resolveVisitorEventContext";

type Channel = "ipad" | "guest_qr";

type ApprovedEvent = Extract<
  PermanentVisitorAdmissionEventResult,
  { admitted: true }
>;

type AdultCommand = Readonly<{
  submissionId: string;
  serviceId: string;
  name: string;
  email?: string;
  phone?: string;
}>;

type FamilyCommand = AdultCommand & Readonly<{
  family: Pick<
    ValidatedVisitorFamily,
    "guardianName" | "guardianDeclaration" | "children"
  >;
}>;

type WriterResult = Readonly<{
  status: string;
  reason?: string;
}>;

export type PermanentRegistrationResult =
  | Readonly<{
      accepted: true;
      status: "recorded";
    }>
  | Readonly<{
      accepted: false;
      status:
        | "unavailable"
        | "invalid"
        | "admission_denied"
        | "submission_conflict"
        | "try_later";
    }>;

/**
 * Trusted server-side dependencies only.
 *
 * Neither this object nor its callbacks may originate from
 * visitor JSON, headers, cookies or browser-supplied claims.
 *
 * The admission callback must enforce channel authorization,
 * capacity and appropriate retry protection before returning true.
 */
export type PermanentRegistrationDependencies = {
  enabled?: boolean;
  familyEnabled?: boolean;
  channel?: Channel;
  policy?: PermanentVisitorAdmissionPolicy | null;
  approvedEvents?: readonly VisitorEvent[];
  nowMs?: number;

  admit?: (context: Readonly<{
    channel: Channel;
    event: ApprovedEvent;
    command: AdultCommand | FamilyCommand;
  }>) => Promise<boolean>;

  recordAdult?: (command: AdultCommand) => Promise<WriterResult>;
  recordFamily?: (command: FamilyCommand) => Promise<WriterResult>;
};

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ALLOWED_FIELDS = new Set([
  "name",
  "contactMethod",
  "contact",
  "eventId",
  "family"
]);

function reject(
  status: Extract<
    PermanentRegistrationResult,
    { accepted: false }
  >["status"]
): PermanentRegistrationResult {
  return { accepted: false, status };
}

function plainObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeName(value: string): string {
  return value.normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Internal orchestration only.
 *
 * No HTTP route, credential issuance, direct storage access,
 * Staff authority, communication or follow-up activation.
 *
 * Real registration writers are intentionally not wired here.
 */
export async function submitPermanentVisitorRegistration(
  request: Readonly<{
    submissionId: unknown;
    body: unknown;
  }>,
  deps: PermanentRegistrationDependencies = {}
): Promise<PermanentRegistrationResult> {
  try {
    if (deps.enabled !== true ||
        (deps.channel !== "ipad" &&
         deps.channel !== "guest_qr") ||
        typeof deps.nowMs !== "number" ||
        typeof deps.admit !== "function") {
      return reject("unavailable");
    }

    const body = request.body;

    if (!plainObject(body) ||
        Object.keys(body).some(key => !ALLOWED_FIELDS.has(key)) ||
        typeof request.submissionId !== "string" ||
        !UUID4.test(request.submissionId) ||
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 160 ||
        typeof body.contact !== "string" ||
        !body.contact.trim() ||
        body.contact.length > 254 ||
        (body.contactMethod !== "email" &&
         body.contactMethod !== "phone") ||
        typeof body.eventId !== "string") {
      return reject("invalid");
    }

    const event = assessPermanentVisitorAdmissionEvent({
      policy: deps.policy,
      selectedEventId: body.eventId,
      approvedEvents: deps.approvedEvents ?? [],
      nowMs: deps.nowMs
    });

    if (!event.admitted) {
      return reject("admission_denied");
    }

    const familyRequested =
      Object.prototype.hasOwnProperty.call(body, "family");

    const adult: AdultCommand = {
      submissionId: request.submissionId,
      serviceId: event.serviceId,
      name: body.name.trim(),
      ...(body.contactMethod === "email"
        ? { email: body.contact.trim() }
        : { phone: body.contact.trim() })
    };

    let familyCommand: FamilyCommand | undefined;

    if (familyRequested) {
      if (deps.familyEnabled !== true ||
          typeof deps.recordFamily !== "function") {
        return reject("unavailable");
      }

      const validated = validateVisitorFamily(body.family);

      if (!validated.valid ||
          normalizeName(validated.family.guardianName) !==
            normalizeName(adult.name)) {
        return reject("invalid");
      }

      familyCommand = {
        ...adult,
        family: {
          guardianName: validated.family.guardianName,
          guardianDeclaration: true,
          children: validated.family.children
        }
      };
    } else if (typeof deps.recordAdult !== "function") {
      return reject("unavailable");
    }

    const admitted = await deps.admit({
      channel: deps.channel,
      event,
      command: familyCommand ?? adult
    });

    if (admitted !== true) {
      return reject("admission_denied");
    }

    const result = familyCommand
      ? await deps.recordFamily!(familyCommand)
      : await deps.recordAdult!(adult);

    if (result.status === "recorded") {
      return { accepted: true, status: "recorded" };
    }

    if (result.status === "invalid") {
      return reject("invalid");
    }

    if (result.status === "submission_conflict" ||
        (result.status === "family_incomplete" &&
         result.reason === "submission_conflict")) {
      return reject("submission_conflict");
    }

    // Partial family persistence, uncertain storage outcomes
    // and unexpected writer responses are never success.
    return reject("try_later");

  } catch {
    // Never expose visitor data or internal exception details.
    return reject("try_later");
  }
}
