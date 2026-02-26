import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { getFormationProfile } from "../../storage/formation/formationProfilesRepo";
import { FormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines } from "../../domain/integration/mergeTimelines.v1";
import { listFormationEventsByVisitor } from "../../storage/formation/formationEventsRepo";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import {
  decodeIntegrationCursorV1,
  encodeIntegrationCursorV1,
  type IntegrationAfterV1,
} from "../../contracts/integrationTimelineCursor.v1";
import { encodeCursorV1 } from "../../contracts/timeline.v1";

export type IntegratedTimelinePageV1 = {
  items: any[];
  nextCursor: string | null;
};

function cmpDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? -1 : 1; // DESC
}

function tieKey(item: any): string {
  return `${String(item.stream ?? "")}:${String(item.eventId ?? "")}`;
}

function compareItemsNewestFirst(a: any, b: any): number {
  const t = cmpDesc(String(a.occurredAt ?? ""), String(b.occurredAt ?? ""));
  if (t !== 0) return t;

  const ta = tieKey(a);
  const tb = tieKey(b);
  if (ta === tb) return 0;
  return ta < tb ? -1 : 1;
}

function isOlderThanAfter(item: any, after: IntegrationAfterV1): boolean {
  const itemTime = String(item.occurredAt ?? "");
  const afterTime = after.occurredAt;

  if (itemTime !== afterTime) {
    // strictly older timestamps (ISO strings compare lexicographically)
    return itemTime < afterTime;
  }

  // same timestamp: strictly after the cursor in tie order
  const itemTie = tieKey(item);
  const afterTie = `${after.stream}:${after.eventId}`;
  return itemTie > afterTie;
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

function invMillis(ms: number, width: number, max: number): string {
  const inv = max - ms;
  return padLeft(String(inv), width);
}

// Engagement RowKey format: invMillis15|eventId
function engagementRowKey(occurredAtIso: string, eventId: string): string {
  const ms = Date.parse(occurredAtIso);
  const inv15 = invMillis(ms, 15, 253402300799999);
  return `${inv15}|${eventId}`;
}

// Formation RowKey prefix: invMillis13_uuid (cursor is base64(rowKey))
function formationInvPrefix(occurredAtIso: string): string {
  const ms = Date.parse(occurredAtIso);
  return invMillis(ms, 13, 9999999999999);
}

function toBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export class IntegrationService {
  constructor(
    private engagementRepo: EngagementEventsRepository,
    private formationRepo: FormationEventsRepository,
  ) {}

  async readIntegratedTimeline(
    visitorId: string,
    limit: number,
    cursor?: string,
  ): Promise<IntegratedTimelinePageV1> {
    const safeLimit = Math.max(1, Math.min(200, limit || 50));

    let after: IntegrationAfterV1 | undefined;
    if (cursor) {
      const decoded = decodeIntegrationCursorV1(cursor);
      if (decoded.visitorId !== visitorId)
        throw new Error("Cursor visitorId mismatch");
      after = decoded.after;
    }

    const perStream = Math.min(200, Math.max(50, safeLimit * 5));

    let engagementCursorForRepo: string | undefined;
    let formationCursorForRepo: string | undefined;

    if (after) {
      // Engagement per-stream cursor:
      // - If after.stream is engagement: start after that exact engagement rowKey.
      // - If after.stream is formation: skip ALL engagement items at that same timestamp.
      //   Use "~" sentinel at same invMillis15 (since "~" sorts after typical event ids).
      if (after.stream === "engagement") {
        // Exact mapping: engagement cursor is the durable RowKey format (invMillis15|eventId)
        const engagementAfterRowKey = engagementRowKey(
          after.occurredAt,
          String(after.eventId),
        );

        engagementCursorForRepo = encodeCursorV1({
          visitorId,
          after: engagementAfterRowKey,
        });
      } else {
        // Cross-stream translation:
        // When the integration cursor is a FORMATION item, we still need to advance the engagement stream.
        // We do this by computing the engagement RowKey at the same occurredAt using a HIGH eventId suffix,
        // so "RowKey gt after" returns strictly older engagement items.
        const engInvPrefix = engagementRowKey(after.occurredAt, "~").split(
          "|",
        )[0];
        const engagementAfterRowKey = `${engInvPrefix}|~`;

        engagementCursorForRepo = encodeCursorV1({
          visitorId,
          after: engagementAfterRowKey,
        });
      }

      // Formation per-stream cursor:
      // - If after.stream is formation: start after that exact formation rowKey (= eventId).
      // - If after.stream is engagement: include ALL formation items at that same timestamp.
      //   Use inv13 + "_" sentinel so RowKey gt inv13_ includes inv13_uuid.
      const formationAfterRowKey =
        after.stream === "formation"
          ? String(after.eventId)
          : `${formationInvPrefix(after.occurredAt)}_`;

      formationCursorForRepo = toBase64(formationAfterRowKey);
    }

    const engagementPage = await this.engagementRepo.readTimeline(
      visitorId,
      perStream,
      engagementCursorForRepo,
    );

    const storageConnectionString = process.env.STORAGE_CONNECTION_STRING;
if (!storageConnectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

const eventsTable = getFormationEventsTableClient(storageConnectionString);
await ensureTableExists(eventsTable);

// cursor should be a formation RowKey (older-than paging)
const fetchLimit = perStream + 1;

// Decode integration’s base64(rowKey) per-stream cursor into a real RowKey for storage
const formationBeforeRowKey = formationCursorForRepo
  ? Buffer.from(String(formationCursorForRepo), "base64").toString("utf8")
  : undefined;

// cursor should be a formation RowKey (older-than paging)
const formationAscAll = await listFormationEventsByVisitor(eventsTable as any, visitorId, {
  limit: fetchLimit,
  beforeRowKey: formationBeforeRowKey,
});
// Keep the newest perStream from the ascending list
const formationAscSlice = formationAscAll.slice(-perStream);

// Convert to newest-first items for merge/sort
const formationItems = formationAscSlice
  .slice()
  .reverse()
  .map((e: any) => ({
    v: 1,
    eventId: e.id ?? e.eventId ?? e.rowKey,
    visitorId: e.visitorId ?? visitorId,
    type: e.type,
    occurredAt: e.occurredAt,
    source: { system: "formation" },
    data: e.metadata ? { metadata: e.metadata } : undefined,
  }));

// nextCursor should be the oldest rowKey returned (so we can page older-than it)
const formationPage = {
  items: formationItems,
  nextCursor: formationAscSlice.length > 0 ? (formationAscSlice[0] as any).rowKey : null,
};
const merged = mergeTimelines(
      engagementPage.items ?? [],
      formationPage.items ?? [],
    );
    merged.sort(compareItemsNewestFirst);
    const filtered = after
      ? merged.filter((it) => isOlderThanAfter(it, after))
      : merged;
    const pagePlus = filtered.slice(0, safeLimit + 1);
    const pageItems = pagePlus.slice(0, safeLimit);
    const hasMore = pagePlus.length > safeLimit;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? encodeIntegrationCursorV1({
            v: 1,
            visitorId,
            after: {
              occurredAt: String(pageItems[pageItems.length - 1].occurredAt),
              stream: pageItems[pageItems.length - 1].stream,
              eventId: String(pageItems[pageItems.length - 1].eventId),
            },
          })
        : null;

    return { items: pageItems, nextCursor };
  }
  async readIntegrationSummary(visitorId: string) {
    // Read-only derived view: no new writes, no persistence.
    // Pull "latest" from each stream via their existing read methods.
    const [eng, form] = await Promise.all([
      this.engagementRepo.readTimeline(visitorId, 1, undefined),
      this.formationRepo.listByVisitor({ visitorId, limit: 1, cursor: undefined }),
    ]);

    const lastEngagementAt = eng.items?.[0]?.occurredAt ?? null;
    const lastFormationAt = form.items?.[0]?.occurredAt ?? null;

    const lastIntegratedAt =
      lastEngagementAt && lastFormationAt
        ? (Date.parse(lastEngagementAt) >= Date.parse(lastFormationAt) ? lastEngagementAt : lastFormationAt)
        : (lastEngagementAt ?? lastFormationAt ?? null);


    // Derive assignedTo from Formation Profile snapshot (read-only).
    // Additive: only populate when we have a real assignee id.
    let assignedTo: { ownerType: "user" | "team"; ownerId: string; displayName?: string } | undefined;
    try {
      const cs = process.env.STORAGE_CONNECTION_STRING;
      if (cs) {
        const profiles = getFormationProfilesTableClient(cs);
        const profile = await getFormationProfile(profiles as any, visitorId);
        const assigneeId = String((profile as any)?.assignedTo ?? "").trim();
        if (assigneeId) {
          assignedTo = { ownerType: "user", ownerId: assigneeId };
        }
      }
    } catch {
      // swallow: summary should still work even if profile table is missing
    }

    const hasAssignee = !!(assignedTo && typeof (assignedTo as any).ownerId === "string" && String((assignedTo as any).ownerId).trim());
    return {
      visitorId,
      lastEngagementAt,
      lastFormationAt,
      lastIntegratedAt,
      sources: {
        engagement: !!lastEngagementAt,
        formation: !!lastFormationAt,
      },

      // Phase 4 additive fields (v1 contract). No business logic yet.
      // Minimal default: if no engagement has ever happened, treat as needs follow-up.
      needsFollowup: !!hasAssignee || !lastEngagementAt,
      followupReason: hasAssignee ? "FOLLOWUP_ASSIGNED" : !lastEngagementAt ? "no_engagement_yet" : undefined,
      // Optional / unset until we model business rules + persistence/events:
      assignedTo,
      // followupReason: undefined,
      // groups: undefined,
      // programs: undefined,
      // workflows: undefined,
    };
  }

}




