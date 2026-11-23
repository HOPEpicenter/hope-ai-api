import { getTableClient } from "../../functions/_shared/tableClient";
import {
  getVisitorById,
  normalizePhoneIdentifier
} from "../../functions/_shared/visitorsRepository";
import { recordVisitorCheckIn, type CheckInResult } from "./recordVisitorCheckIn";

type Contact = { email?: string; phone?: string };
type VisitorContact = Contact & {
  rowKey: string;
  name?: string;
  emailLower?: string;
  phoneCanonical?: string;
};

const MAX_VISITORS_TO_MATCH = 2_000;

function readContacts(): AsyncIterable<VisitorContact> {
  return getTableClient("Visitors").listEntities<VisitorContact>({
    queryOptions: {
      filter: "PartitionKey eq 'VISITOR'",
      select: ["RowKey", "name", "email", "emailLower", "phone", "phoneCanonical"]
    }
  });
}

function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesContact(visitor: Omit<VisitorContact, "rowKey">, email: string, phone: string) {
  return {
    email: Boolean(email && [visitor.emailLower, visitor.email].some(
      value => value?.trim().toLowerCase() === email
    )),
    phone: Boolean(phone && [visitor.phoneCanonical, visitor.phone].some(
      value => normalizePhoneIdentifier(value ?? "") === phone
    ))
  };
}

/** Resolve contact evidence without creating or editing a profile. */
export async function resolveVisitorCheckInIdentity(
  command: Contact & { name: string },
  dependencies: {
    readContacts?: typeof readContacts;
    readVisitor?: typeof getVisitorById;
  } = {}
): Promise<
  | { status: "matched"; visitorId: string }
  | { status: "invalid" | "unmatched" | "requires_staff_review" }
> {
  const name = normalizeName(command.name);
  const email = command.email?.trim().toLowerCase() ?? "";
  const phone = normalizePhoneIdentifier(command.phone ?? "");
  if (
    !name || name.length > 160 || (!email && !phone) ||
    (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (command.phone?.trim() && !/^\d{7,15}$/.test(phone))
  ) return { status: "invalid" };

  let candidate: string | undefined;
  let count = 0;
  for await (const visitor of (dependencies.readContacts ?? readContacts)()) {
    if (++count > MAX_VISITORS_TO_MATCH) return { status: "requires_staff_review" };
    const match = matchesContact(visitor, email, phone);
    if (!match.email && !match.phone) continue;
    if (
      candidate !== undefined || !visitor.rowKey ||
      normalizeName(visitor.name ?? "") !== name ||
      (email && !match.email) || (phone && !match.phone)
    ) return { status: "requires_staff_review" };
    candidate = visitor.rowKey;
  }
  if (candidate === undefined) return { status: "unmatched" };

  const visitor = await (dependencies.readVisitor ?? getVisitorById)(candidate);
  if (!visitor || visitor.visitorId !== candidate || normalizeName(visitor.name) !== name) {
    return { status: "requires_staff_review" };
  }
  const match = matchesContact(visitor, email, phone);
  if ((email && !match.email) || (phone && !match.phone)) {
    return { status: "requires_staff_review" };
  }
  return { status: "matched", visitorId: candidate };
}

export async function recordReturningVisitorCheckIn(
  command: Contact & { name: string; submissionId: string; serviceId: string },
  dependencies: NonNullable<Parameters<typeof resolveVisitorCheckInIdentity>[1]> & {
    record?: typeof recordVisitorCheckIn;
  } = {}
): Promise<CheckInResult | { status: "unmatched" | "requires_staff_review" }> {
  const identity = await resolveVisitorCheckInIdentity(command, dependencies);
  if (identity.status !== "matched") return { status: identity.status };
  return (dependencies.record ?? recordVisitorCheckIn)({
    submissionId: command.submissionId,
    visitorId: identity.visitorId,
    serviceId: command.serviceId
  });
}
