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
  if (ae !== be) return ae > be ? -1 : 1;

  const as = String(a?.stream ?? "");
  const bs = String(b?.stream ?? "");
  if (as === bs) return 0;
  return as > bs ? -1 : 1;
}

function makeIntegratedTimelineCursor(item: any): string | null {
  const occurredAt = String(item?.occurredAt ?? "").trim();
  const eventId = String(item?.eventId ?? "").trim();
  const stream = String(item?.stream ?? "").trim();

  if (!occurredAt || !eventId) return null;

  return [occurredAt, eventId, stream].join("|");
}

function parseIntegratedTimelineCursor(cursor: string): any | null {
  const parts = String(cursor ?? "").split("|");
  const occurredAt = String(parts[0] ?? "").trim();
  const eventId = String(parts[1] ?? "").trim();
  const stream = String(parts[2] ?? "").trim();

  if (!occurredAt || !eventId) return null;

  // stream is optional for backwards compatibility with older occurredAt|eventId cursors
  return {
    occurredAt,
    eventId,
    stream
  };
}

function isAfterIntegratedCursor(item: any, cursorItem: any): boolean {
  return compareNewestFirst(item, cursorItem) > 0;
}

function summaryForItem(item: any): string {
  const type = String(item?.type ?? "").trim();

  if (item?.stream === "formation") {
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

function classifyTimelineActivity(item: any): { activityType: string; activityCategory: string } {
  const type = String(item?.type ?? "").trim();

  if (type === "FOLLOWUP_ASSIGNED") {
    return { activityType: "FOLLOWUP_ASSIGNED", activityCategory: "FOLLOWUP" };
  }

  if (type === "FOLLOWUP_CONTACTED") {
    return { activityType: "CONTACT_MADE", activityCategory: "FOLLOWUP" };
  }

  if (type === "FOLLOWUP_OUTCOME_RECORDED") {
    return { activityType: "FOLLOWUP_COMPLETED", activityCategory: "FOLLOWUP" };
  }

  if (type === "FOLLOWUP_UNASSIGNED") {
    return { activityType: "FOLLOWUP_UNASSIGNED", activityCategory: "FOLLOWUP" };
  }

  if (type === "status.transition") {
    const to = String(item?.data?.to ?? "").trim().toUpperCase();

    if (to === "ENGAGED") {
      return { activityType: "VISITOR_ENGAGED", activityCategory: "ENGAGEMENT" };
    }

    if (to === "DISENGAGED") {
      return { activityType: "VISITOR_DISENGAGED", activityCategory: "ENGAGEMENT" };
    }

    return { activityType: "STATUS_CHANGE", activityCategory: "ENGAGEMENT" };
  }

  if (type === "NEXT_STEP_SELECTED") {
    return { activityType: "NEXT_STEP_SELECTED", activityCategory: "FORMATION" };
  }

  return { activityType: type || "UNKNOWN", activityCategory: "OTHER" };
}

function enrichTimelineItems(items: any[]) {
  return items.map((item) => ({
    ...item,
    ...classifyTimelineActivity(item),
    summary: summaryForItem(item),
    data: item?.data ?? {}
  }));
}

function getTimelineGroupKey(item: any): string {
  const visitorId = String(item?.visitorId ?? "").trim();
  const stream = String(item?.stream ?? "").trim();
  const type = String(item?.type ?? "").trim();
  const day = String(item?.occurredAt ?? "").slice(0, 10);

  if (!visitorId || !stream || !type || !day) return "";

  // Keep status transitions separate because they tell a sequence.
  if (type === "status.transition") return "";

  return [visitorId, stream, type, day].join("|");
}

function formatGroupedSummary(summary: string, count: number): string {
  if (count <= 1) return summary;

  const normalized = summary.trim();
  if (normalized.toLowerCase() === "followup outcome recorded") {
    return `Followups completed (${count})`;
  }

  if (normalized.toLowerCase() === "followup contacted") {
    return `Contacts made (${count})`;
  }

  if (normalized.toLowerCase() === "followup assigned") {
    return `Followups assigned (${count})`;
  }

  if (normalized.toLowerCase() === "followup unassigned") {
    return `Followups unassigned (${count})`;
  }

  return `${normalized} (${count})`;
}

function groupTimelinePageItems(items: any[]): any[] {
  const result: any[] = [];

  for (const item of items) {
    const key = getTimelineGroupKey(item);
    const previous = result[result.length - 1];
    const previousKey = previous ? getTimelineGroupKey(previous) : "";

    if (key && previous && key === previousKey) {
      const count = Number(previous.groupCount ?? 1) + 1;
      const groupedEventIds = Array.isArray(previous.groupedEventIds)
        ? previous.groupedEventIds
        : [previous.eventId];

      previous.groupCount = count;
      previous.groupedEventIds = [...groupedEventIds, item.eventId].filter(Boolean);
      previous.groupedUntil = item.occurredAt ?? previous.groupedUntil ?? previous.occurredAt;
      previous.summary = formatGroupedSummary(String(previous.summary ?? summaryForItem(previous)), count);
      continue;
    }

    result.push({
      ...item,
      groupCount: 1
    });
  }

  return result;
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
      const cursorItem = parseIntegratedTimelineCursor(opts.cursor);

      if (cursorItem) {
        merged = merged.filter((item) => {
          if (!item?.occurredAt || !item?.eventId) return false;
          return isAfterIntegratedCursor(item, cursorItem);
        });
      }
    }

    const rawPageItems = merged.slice(0, safeLimit);
    const pageItems = groupTimelinePageItems(rawPageItems);

    const nextCursor =
      merged.length > safeLimit
        ? (() => {
            const last = rawPageItems[rawPageItems.length - 1];
            return makeIntegratedTimelineCursor(last);
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

















