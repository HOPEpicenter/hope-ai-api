import type { TableClient } from "@azure/data-tables";

import type {
  SixWeekFollowupEventsRepository
} from "../../repositories/sixWeekFollowupEventsRepository";

import {
  projectSixWeekVisitorFollowup,
  PUBLIC_VISITOR_SYSTEM_ORIGIN,
  PUBLIC_VISITOR_CONSENT_WITHDRAWAL_REASON,
  type SixWeekFollowupEvent
} from "../../domain/followups/projectSixWeekVisitorFollowup";

import {
  readLatestRegistrationConsent
} from "./startConsentProtectedSixWeekFollowup";

import {
  isVisitorCheckInRequest
} from "../visitors/recordVisitorCheckIn";

const SYSTEM_ORIGIN = PUBLIC_VISITOR_SYSTEM_ORIGIN;

const VISITOR_ID =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type RecordedPublicVisitEvidence = Readonly<{
  visitorId: string;
  submissionId: string;
  serviceId: string;
  visitDate: string;
}>;

export type PublicVisitorEnrollmentResult =
  | "enrolled"
  | "existing"
  | "not_eligible"
  | "unavailable";

type Dependencies = {
  enabled?: boolean;
  visitors?: TableClient;
  repository?: Pick<
    SixWeekFollowupEventsRepository,
    "append" | "listByVisitor"
  >;
};

type RegistrationReceipt = {
  visitorId: string;
  serviceId: string;
  recordedAt: string;
  registrationDetailsJson?: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

/**
 * Narrow internal system enrollment boundary.
 *
 * Only the trusted registration pipeline may call this
 * after complete canonical attendance has been recorded.
 *
 * No public route or browser-supplied actor is accepted.
 * No Staff identity is impersonated.
 * No communication delivery occurs here.
 */
export async function enrollRecordedPublicVisitor(
  evidence: RecordedPublicVisitEvidence,
  deps: Dependencies = {}
): Promise<PublicVisitorEnrollmentResult> {
  if (deps.enabled !== true ||
      !deps.visitors ||
      !deps.repository ||
      !VISITOR_ID.test(evidence.visitorId) ||
      !validDate(evidence.visitDate) ||
      !isVisitorCheckInRequest(
        evidence.submissionId,
        evidence.serviceId
      )) {
    return "unavailable";
  }

  try {
    const receipt =
      await deps.visitors.getEntity<RegistrationReceipt>(
        "VISITOR_CHECK_IN",
        evidence.submissionId
      );

    if (receipt.partitionKey !== "VISITOR_CHECK_IN" ||
        receipt.rowKey !== evidence.submissionId ||
        receipt.visitorId !== evidence.visitorId ||
        receipt.serviceId !== evidence.serviceId ||
        typeof receipt.registrationDetailsJson !== "string" ||
        Buffer.byteLength(
          receipt.registrationDetailsJson, "utf8"
        ) > 8192 ||
        typeof receipt.recordedAt !== "string") {
      return "unavailable";
    }

    const recorded = new Date(receipt.recordedAt);

    if (!Number.isFinite(recorded.getTime()) ||
        recorded.toISOString() !== receipt.recordedAt) {
      return "unavailable";
    }

    const details: unknown = JSON.parse(
      receipt.registrationDetailsJson
    );

    if (!details ||
        typeof details !== "object" ||
        Array.isArray(details)) {
      return "unavailable";
    }

    const profile = details as Record<string, unknown>;

    if (profile.version !== 1 ||
        typeof profile.contactConsent !== "boolean") {
      return "unavailable";
    }

    const currentConsent =
      await readLatestRegistrationConsent(
        evidence.visitorId,
        deps.visitors
      );

    if (currentConsent !== "granted" &&
        currentConsent !== "declined") {
      return "unavailable";
    }

    const visitor = await deps.visitors.getEntity(
      "VISITOR", evidence.visitorId
    );

    if (visitor.partitionKey !== "VISITOR" ||
        visitor.rowKey !== evidence.visitorId) {
      return "unavailable";
    }

    const repository = deps.repository;

    async function closeForDecline():
      Promise<PublicVisitorEnrollmentResult> {
      const events = await repository.listByVisitor(
        evidence.visitorId
      );

      if (events.some(event =>
        event.visitorId !== evidence.visitorId
      )) {
        return "unavailable";
      }

      if (events.length === 0) {
        return "not_eligible";
      }

      const plan =
        projectSixWeekVisitorFollowup(events);

      if (!plan) {
        return "unavailable";
      }

      if (plan.status === "completed" ||
          plan.status === "cancelled") {
        return "not_eligible";
      }

      // Recheck the latest decision before closure.
      // An old declined receipt must not override a
      // subsequently recorded grant by itself.
      const latest = await readLatestRegistrationConsent(
        evidence.visitorId,
        deps.visitors
      );

      if (latest === "granted") {
        return "not_eligible";
      }

      if (latest !== "declined") {
        return "unavailable";
      }

      await repository.append({
        eventId:
          `evt-public-withdrawal-${evidence.submissionId}`,
        visitorId: evidence.visitorId,
        type: "six_week_followup.plan_cancelled",
        occurredAt: new Date().toISOString(),
        actorId: SYSTEM_ORIGIN,
        data: {
          reason:
            PUBLIC_VISITOR_CONSENT_WITHDRAWAL_REASON
        }
      });

      const persisted = await repository.listByVisitor(
        evidence.visitorId
      );

      if (persisted.some(event =>
        event.visitorId !== evidence.visitorId
      )) {
        return "unavailable";
      }

      const closed =
        projectSixWeekVisitorFollowup(persisted);

      return closed &&
        (closed.status === "cancelled" ||
         closed.status === "completed") &&
        closed.nextTask === null
        ? "not_eligible"
        : "unavailable";
    }

    if (currentConsent === "declined") {
      return await closeForDecline();
    }

    // An older declined visit cannot initiate enrollment,
    // even when a subsequent visit granted permission.
    if (profile.contactConsent !== true) {
      return "not_eligible";
    }

    const previous = await repository.listByVisitor(
      evidence.visitorId
    );

    if (previous.some(event =>
      event.visitorId !== evidence.visitorId
    )) {
      return "unavailable";
    }

    if (previous.length > 0) {
      // Never restart, reset or replace existing plans,
      // including paused, completed or cancelled plans.
      const plan = projectSixWeekVisitorFollowup(previous);

      return plan ? "existing" : "unavailable";
    }

    // Recheck durable permission immediately before
    // attempting the unique plan-start append.
    const latest = await readLatestRegistrationConsent(
      evidence.visitorId,
      deps.visitors
    );

    if (latest === "declined") {
      return await closeForDecline();
    }

    if (latest !== "granted") {
      return "unavailable";
    }

    const event: SixWeekFollowupEvent = {
      eventId: `evt-public-${evidence.submissionId}`,
      visitorId: evidence.visitorId,
      type: "six_week_followup.plan_started",
      occurredAt: receipt.recordedAt,
      actorId: SYSTEM_ORIGIN,
      data: {
        firstVisitDate: evidence.visitDate,
        ownerStaffId: null,
        contactConsent: true,
        preferredContactMethod: null
      }
    };

    const created = await repository.append(event);

    const persisted = await repository.listByVisitor(
      evidence.visitorId
    );

    if (persisted.some(item =>
      item.visitorId !== evidence.visitorId
    )) {
      return "unavailable";
    }

    const plan = projectSixWeekVisitorFollowup(persisted);

    if (!plan ||
        plan.visitorId !== evidence.visitorId) {
      return "unavailable";
    }

    if (created && plan.startedBy !== SYSTEM_ORIGIN) {
      return "unavailable";
    }

    // Reconcile a withdrawal observed while the
    // unique plan-start operation was in progress.
    const afterAppend =
      await readLatestRegistrationConsent(
        evidence.visitorId,
        deps.visitors
      );

    if (afterAppend === "declined") {
      return await closeForDecline();
    }

    if (afterAppend !== "granted") {
      return "unavailable";
    }

    return created ? "enrolled" : "existing";
  } catch {
    // A later identical registration retry can recover
    // from the canonical visit and unique plan-start row.
    return "unavailable";
  }
}
