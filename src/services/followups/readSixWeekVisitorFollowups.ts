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
): Promise<SixWeekVisitorFollowupPlan | null> {
  const normalizedVisitorId = String(visitorId ?? "").trim();
  if (!normalizedVisitorId) return null;

  const repository =
    dependencies.repository ?? new SixWeekFollowupEventsRepository();

  return projectSixWeekVisitorFollowup(
    await repository.listByVisitor(normalizedVisitorId),
    normalizeAsOf(asOf)
  );
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

  const readVisitor = dependencies.getVisitor ?? getVisitorById;

  const resolved = await Promise.all(
    plans.map(async plan => ({
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
    items
  };
}
