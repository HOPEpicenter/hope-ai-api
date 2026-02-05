import { decodeCursorV1, encodeCursorV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines, makeStableKey } from "../../domain/integration/mergeTimelines.v1";

export type IntegratedTimelinePageV1 = {
  items: ReturnType<typeof mergeTimelines>;
  nextCursor: string | null;
};

export class IntegrationService {
  constructor(
    private engagementRepo: EngagementEventsRepository,
    private formationRepo: AzureTableFormationEventsRepository
  ) {}

  async readIntegratedTimeline(visitorId: string, limit: number, cursor?: string): Promise<IntegratedTimelinePageV1> {
    let afterKey: string | undefined;

    if (cursor) {
      const decoded = decodeCursorV1(cursor);
      if (decoded.visitorId !== visitorId) throw new Error("Cursor visitorId mismatch");
      afterKey = decoded.after;
    }

    // Read a bit more than needed from each stream to ensure we can fill `limit` after merging.
    // Keep this bounded/predictable (no unbounded fan-out).
    const perStream = Math.min(200, Math.max(limit, 50));

    const engagementPage = await this.engagementRepo.readTimeline(visitorId, perStream, undefined);
    const formationPage: any = await this.formationRepo.listByVisitor({ visitorId, limit: perStream, cursor: undefined } as any);

    const merged = mergeTimelines(engagementPage.items ?? [], formationPage.items ?? []);

    const filtered = afterKey ? merged.filter(e => makeStableKey(e) > afterKey) : merged;

    const pageItems = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    const nextCursor =
      hasMore && pageItems.length > 0
        ? encodeCursorV1({ visitorId, after: makeStableKey(pageItems[pageItems.length - 1]) })
        : null;

    return { items: pageItems, nextCursor };
  }
}
