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

    const perStream = Math.min(200, Math.max(50, safeLimit * 5));

    // NOTE: Do not pass integration cursor into repos (cursor contracts differ).
    const engagementPage = await this.engagementRepo.readTimeline(visitorId, perStream, undefined);
    const formationPage = await this.formationRepo.listByVisitor({
      visitorId,
      limit: perStream,
      cursor: undefined,
    });

    const merged = mergeTimelines(engagementPage.items ?? [], formationPage.items ?? []);
    merged.sort(compareItemsNewestFirst);

    const filtered = after ? merged.filter((it) => isOlderThanAfter(it, after)) : merged;

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
