import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { FormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines } from "../../domain/integration/mergeTimelines.v1";
import {
  decodeIntegrationCursorV1,
  encodeIntegrationCursorV1,
  type IntegrationAfterV1,
} from "../../contracts/integrationTimelineCursor.v1";

export type IntegratedTimelinePageV1 = {
  items: any[];
  nextCursor: string | null;
};

function cmpDesc(a: string, b: string): number {
  // ISO8601 strings compare lexicographically by time
  if (a === b) return 0;
  return a > b ? -1 : 1; // DESC
}

function compareItemsNewestFirst(a: any, b: any): number {
  const t = cmpDesc(String(a.occurredAt ?? ""), String(b.occurredAt ?? ""));
  if (t !== 0) return t;

  const sa = String(a.stream ?? "");
  const sb = String(b.stream ?? "");
  if (sa !== sb) return sa < sb ? -1 : 1;

  const ea = String(a.eventId ?? "");
  const eb = String(b.eventId ?? "");
  if (ea === eb) return 0;
  return ea < eb ? -1 : 1;
}

function isOlderThanAfter(item: any, after: IntegrationAfterV1): boolean {
  // Keep items strictly "older than" the cursor
  const t = cmpDesc(String(item.occurredAt ?? ""), after.occurredAt);
  if (t !== 0) {
    // if item occurredAt is "newer" than after, cmpDesc returns -1 (meaning item > after)
    // we only want older, so accept when item is older => cmpDesc returns 1
    return t === 1;
  }

  const sItem = String(item.stream ?? "");
  if (sItem !== after.stream) return sItem > after.stream;

  const eItem = String(item.eventId ?? "");
  return eItem > after.eventId;
}

export class IntegrationService {
  constructor(
    private engagementRepo: EngagementEventsRepository,
    private formationRepo: FormationEventsRepository
  ) {}

  async readIntegratedTimeline(
    visitorId: string,
    limit: number,
    cursor?: string
  ): Promise<IntegratedTimelinePageV1> {
    const safeLimit = Math.max(1, Math.min(200, limit || 50));

    let after: IntegrationAfterV1 | undefined;
    if (cursor) {
      const decoded = decodeIntegrationCursorV1(cursor);
      if (decoded.visitorId !== visitorId) throw new Error("Cursor visitorId mismatch");
      after = decoded.after;
    }

    // bounded + predictable fan-out (v1)
    const perStream = Math.min(200, Math.max(50, safeLimit * 5));

    // IMPORTANT:
    // - Engagement repo cursor is encodeCursorV1(rowKey) (base64url JSON) :contentReference[oaicite:9]{index=9}
    // - Formation repo cursor is base64(rowKey) :contentReference[oaicite:10]{index=10}
    // So we DO NOT pass integration cursor into either stream (avoid cross-contract bugs).
    const engagementPage = await this.engagementRepo.readTimeline(visitorId, perStream, undefined);
    const formationPage = await this.formationRepo.listByVisitor({ visitorId, limit: perStream, cursor: undefined });

    const merged = mergeTimelines(engagementPage.items ?? [], formationPage.items ?? []);

    merged.sort(compareItemsNewestFirst);

    const filtered = after ? merged.filter((it) => isOlderThanAfter(it, after!)) : merged;

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
