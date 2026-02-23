import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { FormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines } from "../../domain/integration/mergeTimelines.v1";
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

    const formationPage = await this.formationRepo.listByVisitor({
      visitorId,
      limit: perStream,
      cursor: formationCursorForRepo,
    });

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
}
