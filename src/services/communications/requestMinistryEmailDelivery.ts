import {
  MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION,
  type MinistryEmailDeliveryRecord
} from "../../domain/communications/ministryEmailDeliveryContracts";
import { projectMinistryCommunications } from "../../domain/communications/projectMinistryCommunications";
import { projectSixWeekVisitorFollowup } from "../../domain/followups/projectSixWeekVisitorFollowup";
import type { MinistryCommunicationEventsRepository } from "../../repositories/ministryCommunicationEventsRepository";
import { MinistryCommunicationEventsRepository as DefaultCommunicationRepository } from "../../repositories/ministryCommunicationEventsRepository";
import type { MinistryEmailDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";
import { MinistryEmailDeliveriesRepository as DefaultDeliveriesRepository } from "../../repositories/ministryEmailDeliveriesRepository";
import type { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { SixWeekFollowupEventsRepository as DefaultSixWeekRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { getFeatureFlags } from "../../config/featureFlags";
import {
  isMinistryEmailRecipientAllowed
} from "../../config/ministryEmailRecipientPolicy";
import {
  getVisitorById,
  type FunctionVisitor
} from "../../functions/_shared/visitorsRepository";
import { readCanonicalStaffIdentity } from "../staff/readCanonicalStaffDirectory";
import { evaluateMinistryEmailDeliveryRequestReadiness } from "./evaluateMinistryEmailDeliveryRequestReadiness";

type CommunicationRepository = Pick<MinistryCommunicationEventsRepository, "listByVisitor">;
type SixWeekRepository = Pick<SixWeekFollowupEventsRepository, "listByVisitor">;
type DeliveryRepository = Pick<MinistryEmailDeliveriesRepository, "create" | "getById">;
type StaffIdentity = { staffId: string; status: "active" | "inactive" };
type VisitorReader = (visitorId: string) => Promise<FunctionVisitor | null>;
type RequestIdentity = Pick<
  MinistryEmailDeliveryRecord,
  "visitorId" | "communicationId" | "requestedBy" | "subject" | "body" | "recipientEmail"
>;

export type RequestMinistryEmailDeliveryInput = {
  visitorId: string;
  actorId: string;
  deliveryId: string;
  communicationId: string;
  subject: string;
  /** Exact staff-reviewed plain-text content; HTML delivery is not implemented. */
  body: string;
};

export type RequestMinistryEmailDeliveryDependencies = {
  phase5Enabled?: () => boolean;
  communicationRepository?: CommunicationRepository;
  sixWeekRepository?: SixWeekRepository;
  deliveriesRepository?: DeliveryRepository;
  readActor?: (staffId: string) => Promise<StaffIdentity | null>;
  getVisitor?: VisitorReader;
  recipientAllowed?: (recipientEmail: string) => boolean;
  now?: () => string;
};

export type RequestMinistryEmailDeliveryResult =
  | {
    accepted: true;
    status: 201 | 200;
    created: boolean;
    delivery: MinistryEmailDeliveryRecord;
  }
  | { accepted: false; status: 400 | 403 | 404 | 409 | 503; error: string };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function communicationRepositoryFor(
  dependencies: RequestMinistryEmailDeliveryDependencies
): CommunicationRepository {
  return dependencies.communicationRepository ?? new DefaultCommunicationRepository();
}

function sixWeekRepositoryFor(
  dependencies: RequestMinistryEmailDeliveryDependencies
): SixWeekRepository {
  return dependencies.sixWeekRepository ?? new DefaultSixWeekRepository();
}

function deliveriesRepositoryFor(
  dependencies: RequestMinistryEmailDeliveryDependencies
): DeliveryRepository {
  return dependencies.deliveriesRepository ?? new DefaultDeliveriesRepository();
}

function sameRequest(
  existing: MinistryEmailDeliveryRecord,
  requested: RequestIdentity
): boolean {
  return existing.visitorId === requested.visitorId &&
    existing.communicationId === requested.communicationId &&
    existing.requestedBy === requested.requestedBy &&
    existing.subject === requested.subject &&
    existing.body === requested.body &&
    existing.recipientEmail === requested.recipientEmail;
}

function conflict(error: string): RequestMinistryEmailDeliveryResult {
  return { accepted: false, status: 409, error };
}

function compareExisting(
  existing: MinistryEmailDeliveryRecord | null,
  request: RequestIdentity
): RequestMinistryEmailDeliveryResult | null {
  if (!existing) return null;
  if (!sameRequest(existing, request)) {
    return conflict("DELIVERY_IDEMPOTENCY_CONFLICT");
  }
  return { accepted: true, status: 200, created: false, delivery: existing };
}

function requestIsValid(input: RequestMinistryEmailDeliveryInput): boolean {
  return Boolean(
    text(input?.visitorId) &&
    text(input?.actorId) &&
    text(input?.deliveryId) &&
    text(input?.communicationId) &&
    typeof input?.subject === "string" &&
    text(input.subject) &&
    input.subject.length <= 200 &&
    typeof input?.body === "string" &&
    text(input.body) &&
    input.body.length <= 10000
  );
}

async function resolveContactConsent(
  record: ReturnType<typeof projectMinistryCommunications>["items"][number],
  repository: SixWeekRepository,
  asOf: string
): Promise<boolean> {
  if (record.context !== "six_week_followup") {
    // Email preference is not general consent; no canonical source exists yet
    // for person_360, care, or formation contexts.
    return false;
  }

  const plan = projectSixWeekVisitorFollowup(
    await repository.listByVisitor(record.visitorId),
    asOf
  );
  return plan !== null &&
    plan.contactConsent === true &&
    (!record.relatedFollowupPlanId || record.relatedFollowupPlanId === plan.planId);
}

export async function requestMinistryEmailDelivery(
  input: RequestMinistryEmailDeliveryInput,
  dependencies: RequestMinistryEmailDeliveryDependencies = {}
): Promise<RequestMinistryEmailDeliveryResult> {
  if (!requestIsValid(input)) {
    return { accepted: false, status: 400, error: "Invalid email delivery request" };
  }

  const visitorId = text(input.visitorId);
  const actorId = text(input.actorId);
  const deliveryId = text(input.deliveryId);
  const communicationId = text(input.communicationId);

  const phase5Enabled = dependencies.phase5Enabled
    ? dependencies.phase5Enabled()
    : getFeatureFlags().phase5Communications;
  if (!phase5Enabled) {
    return { accepted: false, status: 503, error: "PHASE5_COMMUNICATIONS_DISABLED" };
  }

  const actor = await (dependencies.readActor ?? readCanonicalStaffIdentity)(actorId);
  if (!actor || actor.status !== "active") {
    return { accepted: false, status: 403, error: "ACTIVE_CANONICAL_STAFF_REQUIRED" };
  }

  const visitorReader = dependencies.getVisitor ?? getVisitorById;
  const visitor = await visitorReader(visitorId);
  if (!visitor || visitor.visitorId !== visitorId) {
    return { accepted: false, status: 404, error: "VISITOR_NOT_FOUND" };
  }
  const recipientEmail = text(visitor.email).toLowerCase();
  if (!recipientEmail) {
    return conflict("CANONICAL_VISITOR_EMAIL_UNAVAILABLE");
  }

  const recipientAllowed =
    dependencies.recipientAllowed ??
    isMinistryEmailRecipientAllowed;
  if (!recipientAllowed(recipientEmail)) {
    return conflict("MINISTRY_EMAIL_RECIPIENT_NOT_ALLOWED");
  }

  const deliveryRepository = deliveriesRepositoryFor(dependencies);
  const requestIdentity: RequestIdentity = {
    visitorId,
    communicationId,
    requestedBy: actor.staffId,
    subject: input.subject,
    body: input.body,
    recipientEmail
  };
  const existingResult = compareExisting(
    await deliveryRepository.getById(deliveryId),
    requestIdentity
  );
  if (existingResult) return existingResult;

  const communicationRepository = communicationRepositoryFor(dependencies);
  const projection = projectMinistryCommunications(
    visitorId,
    await communicationRepository.listByVisitor(visitorId)
  );
  const communication = projection.items.find(
    item => item.communicationId === communicationId
  );
  if (!communication || communication.visitorId !== visitorId) {
    return { accepted: false, status: 404, error: "COMMUNICATION_NOT_FOUND" };
  }
  if (communication.channel !== "email") {
    return conflict("EMAIL_COMMUNICATION_REQUIRED");
  }
  if (communication.cancelledAt !== null) {
    return conflict("COMMUNICATION_CANCELLED");
  }

  const asOf = (dependencies.now ?? (() => new Date().toISOString()))();
  const contactConsent = await resolveContactConsent(
    communication,
    sixWeekRepositoryFor(dependencies),
    asOf
  );
  const preferenceState =
    projection.preferences.find(preference => preference.channel === "email")?.state ??
    "unknown";
  const readiness = evaluateMinistryEmailDeliveryRequestReadiness({
    phase5Enabled,
    contactConsent,
    preferenceState
  });
  if (!readiness.allowed) return conflict(readiness.reason);

  const candidate: MinistryEmailDeliveryRecord = {
    schemaVersion: MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION,
    deliveryId,
    communicationId,
    visitorId,
    channel: "email",
    state: "requested",
    requestedAt: asOf,
    requestedBy: actor.staffId,
    subject: input.subject,
    body: input.body,
    recipientEmail,
    eligibility: {
      phase5Enabled: true,
      contactConsent: true,
      emailPreference: "granted"
    },
    dispatchAttemptId: null,
    dispatchClaimedAt: null,
    provider: null,
    providerMessageId: null,
    providerAcceptedAt: null,
    failedAt: null,
    failureCode: null
  };

  const created = await deliveryRepository.create(candidate);
  if (created) {
    return { accepted: true, status: 201, created: true, delivery: candidate };
  }

  const replayResult = compareExisting(
    await deliveryRepository.getById(deliveryId),
    requestIdentity
  );
  return replayResult ?? conflict("DELIVERY_IDEMPOTENCY_CONFLICT");
}
