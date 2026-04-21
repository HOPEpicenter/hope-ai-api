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

type ActivityFeedInputs = {
  engagementItems: any[];
  formationItems: any[];
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

function normalizeActivityFamily(item: any): string {
  const type = String(item?.type ?? "").trim();
  const summary = String(item?.summary ?? summaryForItem(item) ?? "").trim().toLowerCase();

  if (type === "NEXT_STEP_SELECTED") return "next_step_selected";
  if (type === "status.transition") return "status_transition";
  if (type === "note.add") return "note_add";

  if (type.startsWith("FOLLOWUP_")) return type.toLowerCase();

  if (summary.includes("followup assigned")) return "followup_assigned";
  if (summary.includes("followup contacted")) return "followup_contacted";
  if (summary.includes("followup outcome")) return "followup_outcome_recorded";
  if (summary.includes("followup unassigned")) return "followup_unassigned";

  return type.toLowerCase() || "unknown";
}

function shouldSkipDedupe(item: any): boolean {
  const family = normalizeActivityFamily(item);
  return family === "next_step_selected" ||
    family === "status_transition" ||
    family === "note_add";
}

function dedupeMergedActivityItems(items: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];

  for (const item of items) {
    if (shouldSkipDedupe(item)) {
      result.push(item);
      continue;
    }

    const visitorId = String(item?.visitorId ?? "").trim();
    const occurredAt = String(item?.occurredAt ?? "").trim();
    const family = normalizeActivityFamily(item);
    const summary = String(item?.summary ?? summaryForItem(item) ?? "").trim().toLowerCase();

    const key = [
      visitorId,
      occurredAt,
      family,
      summary
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}
export class IntegrationService {
  constructor(private readonly engagementRepo: EngagementEventsRepository) {}

  async readIntegratedTimeline(visitorId: string, limit: number, cursor?: string) {
    return this.getActivityFeed({ visitorId, limit, cursor });
  }

  async readGlobalIntegratedTimeline(limit: number, cursor?: string) {
    return this.getActivityFeed({ limit, cursor });
  }

  private async getActivityFeed(opts: {
    visitorId?: string;
    limit: number;
    cursor?: string;
  }): Promise<IntegratedTimelinePageV1> {
    const safeLimit = Math.max(1, Math.min(200, Number(opts.limit || 50)));

    const inputs = opts.visitorId
      ? await this.fetchVisitorActivityInputs(opts.visitorId, safeLimit)
      : await this.fetchGlobalActivityInputs();

        let merged = this.buildMergedActivityItems(inputs);

    if (opts.cursor) {
      const [cAt, cId] = opts.cursor.split("|");

      merged = merged.filter((item) => {
        if (!item?.occurredAt || !item?.eventId) return false;

        if (item.occurredAt < cAt) return true;
        if (item.occurredAt > cAt) return false;

        // same timestamp → compare eventId
        return item.eventId < cId;
      });
    }

    const pageItems = merged.slice(0, safeLimit);

    const nextCursor =
      merged.length > safeLimit
        ? (() => {
            const last = pageItems[pageItems.length - 1];
            return last ? `${last.occurredAt}|${last.eventId}` : null;
          })()
        : null;

    const legacyResult = {
      items: pageItems,
      nextCursor
    };

    let shadowResult: IntegratedTimelinePageV1 | null = null;

    // --- Shadow read from global timeline store (global endpoint only) ---
    if (!opts.visitorId) {
      try {
        const { GlobalTimelineRepository } = await import("../../repositories/globalTimelineRepository");
        const repo = new GlobalTimelineRepository();

        shadowResult = await repo.read(safeLimit, opts.cursor);

        console.log("timeline_shadow_compare", {
          legacyCount: legacyResult.items.length,
          shadowCount: shadowResult.items.length
        });
      } catch (err) {
        console.error("timeline shadow read failed", err);
      }
    }
    // --- End shadow read ---

    return shadowResult && shadowResult.items.length > 0 ? shadowResult : legacyResult;
  }

  private buildMergedActivityItems(inputs: ActivityFeedInputs): any[] {
    const merged = enrichTimelineItems(
      [...inputs.engagementItems, ...inputs.formationItems].sort(compareNewestFirst)
    );

    return dedupeMergedActivityItems(merged);
  }

  private async fetchVisitorActivityInputs(
    visitorId: string,
    safeLimit: number
  ): Promise<ActivityFeedInputs> {
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

    const engagementItems = (engagementPage.items ?? []).map((event: any) =>
      toEngagementTimelineItem(event)
    );

    return {
      engagementItems,
      formationItems
    };
  }

  private async fetchGlobalActivityInputs(): Promise<ActivityFeedInputs> {
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
      visitorIds.map((visitorId) => this.engagementRepo.readTimeline(visitorId, 50, undefined))
    );

    const engagementItems = engagementPages.flatMap((page) =>
      (page.items ?? []).map((event: any) => toEngagementTimelineItem(event))
    );

    return {
      engagementItems,
      formationItems
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
}











