import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { getFormationEventsTableClient, getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { listFormationEventsByVisitor } from "../../storage/formation/formationEventsRepo";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { deriveIntegrationSummaryV1 } from "../../domain/integration/deriveIntegrationSummary.v1";

export type IntegratedTimelinePageV1 = {
  items: any[];
  nextCursor: string | null;
};

function compareNewestFirst(a: any, b: any): number {
  const ao = String(a?.occurredAt ?? "");
  const bo = String(b?.occurredAt ?? "");
  if (ao !== bo) return ao > bo ? -1 : 1;

  const ae = String(a?.eventId ?? "");
  const be = String(b?.eventId ?? "");
  if (ae === be) return 0;
  return ae > be ? -1 : 1;
}

function summaryForItem(item: any): string {
  const type = String(item?.type ?? "").trim();

  if (item?.stream === "formation") {
    if (typeof item?.data?.summary === "string" && item.data.summary.trim().length > 0) {
      return item.data.summary.trim();
    }
    if (type === "FOLLOWUP_ASSIGNED") return "Followup assigned";
    if (type === "FOLLOWUP_CONTACTED") return "Followup contacted";
    if (type === "FOLLOWUP_OUTCOME_RECORDED") return "Followup outcome recorded";
    if (type === "FOLLOWUP_UNASSIGNED") return "Followup unassigned";
    return type || "formation event";
  }

  if (item?.stream === "engagement") {
    const data = item?.data ?? {};
    if (typeof data.summary === "string" && data.summary.trim().length > 0) return data.summary.trim();
    if (typeof data.text === "string" && data.text.trim().length > 0) return data.text.trim();
    if (typeof data.notes === "string" && data.notes.trim().length > 0) return data.notes.trim();

    if (type === "status.transition") {
      const to = typeof data.to === "string" ? data.to.trim() : "";
      return to ? `Status -> ${to}` : "Status transition";
    }

    return type || "engagement event";
  }

  return type || "event";
}

function toFormationTimelineItem(visitorId: string, event: any) {
  return {
    eventId: event?.rowKey,
    visitorId,
    type: event?.type,
    occurredAt: event?.occurredAt,
    stream: "formation" as const,
    data: event
  };
}

function toEngagementTimelineItem(event: any) {
  return {
    ...event,
    stream: "engagement" as const,
    data: event?.data ?? {}
  };
}

function enrichTimelineItems(items: any[]) {
  return items.map((item) => ({
    ...item,
    summary: summaryForItem(item),
    data: item?.data ?? {}
  }));
}

export class IntegrationService {
  constructor(private readonly engagementRepo: EngagementEventsRepository) {}

  async readIntegratedTimeline(
    visitorId: string,
    limit: number,
    _cursor?: string
  ): Promise<IntegratedTimelinePageV1> {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

    const engagementPage = await this.engagementRepo.readTimeline(visitorId, safeLimit, undefined);

    const eventsTable = getFormationEventsTableClient();
    await ensureTableExists(eventsTable);

    const formationAscAll = await listFormationEventsByVisitor(eventsTable as any, visitorId, {
      limit: 500
    });

    const formationItems = formationAscAll
      .slice()
      .reverse()
      .map((event: any) => toFormationTimelineItem(visitorId, event));

    const engagementItems = (engagementPage.items ?? []).map((event: any) => toEngagementTimelineItem(event));

    const merged = enrichTimelineItems(
      [...engagementItems, ...formationItems].sort(compareNewestFirst)
    );

    return {
      items: merged.slice(0, safeLimit),
      nextCursor: null
    };
  }

  async readIntegrationSummary(visitorId: string) {
    const engagementPage = await this.engagementRepo.readTimeline(visitorId, 1, undefined);
    const lastEngagementAt = engagementPage.items?.[0]?.occurredAt ?? null;

    const profilesTable = getFormationProfilesTableClient();
    await ensureTableExists(profilesTable);

    const profile = await getFormationProfile(profilesTable as any, visitorId);

    let lastFormationAt = String((profile as any)?.lastEventAt ?? "").trim() || null;

    const assignedToUserIdRaw = String((profile as any)?.assignedTo ?? "").trim();
    const assignedToUserId = assignedToUserIdRaw || null;

    const lastFollowupAssignedAt = (profile as any)?.lastFollowupAssignedAt ?? null;
    const lastFollowupContactedAt = (profile as any)?.lastFollowupContactedAt ?? null;
    const lastFollowupOutcomeAt = (profile as any)?.lastFollowupOutcomeAt ?? null;

    const groups = (profile as any)?.groups;
    const programs = (profile as any)?.programs;
    const workflows = (profile as any)?.workflows;

    return deriveIntegrationSummaryV1({
      visitorId,
      lastEngagementAt,
      lastFormationAt,
      assignedToUserId,
      lastFollowupAssignedAt,
      lastFollowupContactedAt,
      lastFollowupOutcomeAt,
      groups,
      programs,
      workflows
    });
  }

  async readGlobalIntegratedTimeline(limit: number, _cursor?: string): Promise<IntegratedTimelinePageV1> {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

    const eventsTable = getFormationEventsTableClient();
    await ensureTableExists(eventsTable);

    const formationEntities: any[] = [];
    for await (const entity of (eventsTable as any).listEntities()) {
      formationEntities.push(entity);
      if (formationEntities.length >= 200) break;
    }

    const formationItems = formationEntities.map((event: any) =>
      toFormationTimelineItem(event?.visitorId, event)
    );

    const visitorIds = Array.from(
      new Set(
        formationItems
          .map((item) => String(item?.visitorId ?? "").trim())
          .filter((id) => id.length > 0)
      )
    );

    const engagementPages = await Promise.all(
      visitorIds.map((visitorId) => this.engagementRepo.readTimeline(visitorId, 20, undefined))
    );

    const engagementItems = engagementPages.flatMap((page) =>
      (page.items ?? []).map((event: any) => toEngagementTimelineItem(event))
    );

    const merged = enrichTimelineItems(
      [...engagementItems, ...formationItems].sort(compareNewestFirst)
    );

    return {
      items: merged.slice(0, safeLimit),
      nextCursor: null
    };
  }
}
