import type {
  PublicVisitProfile
} from "./preparePermanentPublicVisitRegistration";

import { createHash, randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { getTableClient } from "../../functions/_shared/tableClient";
import { createVisitorFromCheckIn, normalizePhoneIdentifier } from "../../functions/_shared/visitorsRepository";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { resolveVisitorCheckInIdentity } from "./recordReturningVisitorCheckIn";
import {
  isVisitorCheckInRequest, recordVisitorCheckIn, type CheckInResult
} from "./recordVisitorCheckIn";

const CLAIM_PARTITION = "VISITOR_CHECK_IN_CLAIM";

type Arrival = {
  submissionId: string;
  serviceId: string;
  name: string;
  email?: string;
  phone?: string;
  profile?: PublicVisitProfile;
};

type Claim = {
  partitionKey: string;
  rowKey: string;
  fingerprint: string;
  visitorId: string;
  createProfile: boolean;
  claimedAt: string;
};

async function readClaim(table: TableClient, submissionId: string): Promise<Claim | null> {
  try {
    return await table.getEntity<Claim>(CLAIM_PARTITION, submissionId);
  } catch (error) {
    if ((error as { statusCode?: number } | null)?.statusCode === 404) return null;
    throw error;
  }
}

/** Internal arrival flow. The trusted caller supplies the service ID. */
export async function recordVisitorArrival(
  command: Arrival,
  dependencies: {
    table?: TableClient;
    resolveIdentity?: typeof resolveVisitorCheckInIdentity;
    createProfile?: typeof createVisitorFromCheckIn;
    record?: typeof recordVisitorCheckIn;
  } = {}
): Promise<CheckInResult | { status: "requires_staff_review" }> {
  if (!isVisitorCheckInRequest(command.submissionId, command.serviceId)) {
    return { status: "invalid" };
  }

  const name = command.name.normalize("NFC").trim().replace(/\s+/g, " ");
  const email = command.email?.trim().toLowerCase() ?? "";
  const phone = normalizePhoneIdentifier(command.phone ?? "");
  if (
    !name || name.length > 160 || (!email && !phone) ||
    (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    (command.phone?.trim() && !/^\d{7,15}$/.test(phone))
  ) return { status: "invalid" };

  // Keep submitted contact details separate from verified
  // canonical identity indexes. Consent is visit-scoped.
  const registrationDetailsJson =
    command.profile === undefined
      ? undefined
      : JSON.stringify({
          version: 1,
          name,
          email: email || null,
          phone: phone || null,
          visitType: command.profile.visitType,
          churchHome: command.profile.churchHome,
          interests: command.profile.interests,
          invitedBy: command.profile.invitedBy,
          contactConsent: command.profile.contactConsent
        });

  // Preserve the legacy fingerprint for existing callers.
  // Complete public arrivals additionally bind every
  // validated registration detail to the submission.
  const identityFields = [
    command.serviceId, name.toLowerCase(), email, phone
  ];

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(
      registrationDetailsJson === undefined
        ? identityFields
        : [
            "complete-public-visitor-arrival-v1",
            ...identityFields,
            registrationDetailsJson
          ]
    ))
    .digest("hex");
  const table = dependencies.table ?? getTableClient("Visitors");
  await ensureTableExists(table);
  let claim = await readClaim(table, command.submissionId);
  if (!claim) {
    const identity = await (dependencies.resolveIdentity ?? resolveVisitorCheckInIdentity)({
      name, email, phone
    });
    if (identity.status === "invalid") return { status: "invalid" };
    if (identity.status === "requires_staff_review" ||
        (identity.status === "unmatched" && email && phone &&
         command.profile === undefined)) {
      return { status: "requires_staff_review" };
    }
    const proposed: Claim = {
      partitionKey: CLAIM_PARTITION,
      rowKey: command.submissionId,
      fingerprint,
      visitorId: identity.status === "matched" ? identity.visitorId : randomUUID(),
      createProfile: identity.status === "unmatched",
      claimedAt: new Date().toISOString()
    };
    try {
      await table.createEntity(proposed);
      claim = proposed;
    } catch (error) {
      claim = await readClaim(table, command.submissionId);
      if (!claim) throw error;
    }
  }
  if (claim.fingerprint !== fingerprint) return { status: "submission_conflict" };

  if (claim.createProfile) {
    // Only the complete public registration contract
    // enables dual-contact creation. Legacy callers
    // retain their existing identity behavior.
    if (email && phone && command.profile === undefined) {
      return { status: "requires_staff_review" };
    }
    const created = await (dependencies.createProfile ?? createVisitorFromCheckIn)(table, {
      name,
      visitorId: claim.visitorId,
      submissionId: command.submissionId,
      contact: email ? { kind: "EMAIL", value: email } : { kind: "PHONE", value: phone },
      ...(email && phone && command.profile !== undefined
        ? { secondaryPhone: phone }
        : {}),
      now: claim.claimedAt
    });
    if (!created) return { status: "requires_staff_review" };
  }

  return (dependencies.record ?? recordVisitorCheckIn)({
    submissionId: command.submissionId,
    serviceId: command.serviceId,
    visitorId: claim.visitorId,
    ...(registrationDetailsJson !== undefined
      ? { registrationDetailsJson }
      : {})
  }, { table });
}
