import {
  projectSixWeekVisitorFollowup,
  projectSixWeekVisitorFollowups,
  type SixWeekVisitorFollowupPlan
} from "../../domain/followups/projectSixWeekVisitorFollowup";
import { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import {
  getVisitorById,
  type FunctionVisitor
} from "../../functions/_shared/visitorsRepository";
import { contactWriterHoldEnabled } from "./permanentVisitorContactWriterHold";
import { readLatestRegistrationConsent, registrationConsentAuthorityEnabled,
  registrationConsentGuardEnabled } from "./readLatestRegistrationConsent";

type PlanVisibility = "visible" | "restricted" | "unverified";

async function assessPlanVisibility(
  plan: SixWeekVisitorFollowupPlan
): Promise<PlanVisibility> {
  if (!registrationConsentGuardEnabled() ||
      (plan.status !== "active" && plan.status !== "paused")) {
    return "visible";
  }

  const consent = await readLatestRegistrationConsent(plan.visitorId);

  if (consent === "declined" || consent === "pending_verification") {
    return "restricted";
  }

  if (consent === "granted") {
    if (!contactWriterHoldEnabled()) return "visible";

    return registrationConsentAuthorityEnabled() &&
      plan.startedBy === "system:permanent-visitor-registration"
      ? "visible"
      : "restricted";
  }

  if (consent === "legacy_no_evidence" &&
      !registrationConsentAuthorityEnabled() &&
      plan.startedBy !== "system:permanent-visitor-registration") {
    return "visible";
  }

  return "unverified";
}

async function mayExposeActionablePlan(
  plan: SixWeekVisitorFollowupPlan
): Promise<boolean> {
  const visibility = await assessPlanVisibility(plan);

  if (visibility === "unverified") {
    throw new Error("Current registration consent could not be verified");
  }

  return visibility === "visible";
}

export type SixWeekFollowupQueueItem = {
  visitorId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  plan: SixWeekVisitorFollowupPlan;
};

export type SixWeekFollowupQueue = {
  asOf: string;
  count: number;
  due: number;
  overdue: number;
  needsOwner: number;
  items: SixWeekFollowupQueueItem[];
  consentReview?: {
    restrictedCount: number;
    unverifiedCount: number;
  };
};

type ReadRepository = Pick<
  SixWeekFollowupEventsRepository,
  "listByVisitor" | "listAll"
>;

export type SixWeekFollowupReadDependencies = {
  repository?: ReadRepository;
  getVisitor?: (visitorId: string) => Promise<FunctionVisitor | null>;
};

function normalizeAsOf(value?: string): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) return new Date().toISOString();

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("asOf must be a valid ISO date or timestamp");
  }

  return parsed.toISOString();
}

export async function readSixWeekVisitorFollowup(
  visitorId: string,
  asOf?: string,
  dependencies: SixWeekFollowupReadDependencies = {}
): Promise<(SixWeekVisitorFollowupPlan & {
  staffWorkflow?: "consent_protected_public";
}) | null> {
  const normalizedVisitorId = String(visitorId ?? "").trim();
  if (!normalizedVisitorId) return null;

  const repository =
    dependencies.repository ?? new SixWeekFollowupEventsRepository();

  const plan = projectSixWeekVisitorFollowup(
    await repository.listByVisitor(normalizedVisitorId),
    normalizeAsOf(asOf)
  );

  if (plan && !(await mayExposeActionablePlan(plan))) {
    // Not a missing plan: do not imply that a new plan may be started.
    throw new Error("Follow-up permission withdrawn; plan needs reconciliation");
  }

  // This is a presentation capability, not a mutation
  // credential. The read above has already verified consent.
  if (
    plan &&
    registrationConsentAuthorityEnabled() &&
    registrationConsentGuardEnabled() &&
    contactWriterHoldEnabled() &&
    (plan.status === "active" || plan.status === "paused") &&
    plan.startedBy === "system:permanent-visitor-registration"
  ) {
    return {
      ...plan,
      staffWorkflow: "consent_protected_public"
    };
  }

  return plan;
}

export async function readSixWeekVisitorFollowupQueue(
  asOf?: string,
  dependencies: SixWeekFollowupReadDependencies = {}
): Promise<SixWeekFollowupQueue> {
  const normalizedAsOf = normalizeAsOf(asOf);
  const repository =
    dependencies.repository ?? new SixWeekFollowupEventsRepository();

  const plans = projectSixWeekVisitorFollowups(
    await repository.listAll(),
    normalizedAsOf
  ).filter(plan =>
    plan.status === "active" || plan.status === "paused"
  );

  // Keep verified work available without granting permission to
  // restricted or unverified plans. Disclose excluded coverage.
  const assessed = await Promise.all(
    plans.map(async plan => ({
      plan,
      visibility: await assessPlanVisibility(plan)
    }))
  );

  const restrictedCount = assessed.filter(
    entry => entry.visibility === "restricted"
  ).length;

  const unverifiedCount = assessed.filter(
    entry => entry.visibility === "unverified"
  ).length;

  // Preserve existing behavior outside the new authority mode.
  if (!registrationConsentAuthorityEnabled() && unverifiedCount > 0) {
    throw new Error("Current registration consent could not be verified");
  }

  const visiblePlans = assessed.filter(
    entry => entry.visibility === "visible"
  ).map(entry => entry.plan);

  const readVisitor = dependencies.getVisitor ?? getVisitorById;

  const resolved = await Promise.all(
    visiblePlans.map(async plan => ({
      plan,
      visitor: await readVisitor(plan.visitorId)
    }))
  );

  const items = resolved
    .filter(
      (entry): entry is {
        plan: SixWeekVisitorFollowupPlan;
        visitor: FunctionVisitor;
      } => entry.visitor !== null
    )
    .map(entry => ({
      visitorId: entry.plan.visitorId,
      displayName: entry.visitor.name,
      email: entry.visitor.email ?? null,
      phone: entry.visitor.phone ?? null,
      plan: entry.plan
    }));

  return {
    asOf: normalizedAsOf,
    count: items.length,
    due: items.filter(item => item.plan.nextTask?.status === "due").length,
    overdue: items.filter(
      item => item.plan.nextTask?.status === "overdue"
    ).length,
    needsOwner: items.filter(item => item.plan.needsOwner).length,
    items,
    ...(registrationConsentAuthorityEnabled()
      ? { consentReview: { restrictedCount, unverifiedCount } }
      : {})
  };
}
