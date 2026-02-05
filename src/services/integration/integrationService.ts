import { decodeCursorV1, encodeCursorV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { FormationEventsRepository } from "../../repositories/formationEventsRepository";
import { mergeTimelines, makeStableKey } from "../../domain/integration/mergeTimelines.v1";

export type IntegratedTimelinePageV1 = {
  items: any[];
  nextCursor: string | null;
};

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
    let afterKey: string | undefined;

    if (cursor) {
      const decoded = decodeCursorV1(cursor);
      if (decoded.visitorId !== visitorId) throw new Error("Cursor visitorId mismatch");
      afterKey = decoded.after;
    }

    // Bounded/predictable fan-out
    const maxIters = 4;
    const perStream = Math.min(200, Math.max(limit, 50));

    // Use the SAME cursor contract for each underlying stream where supported.
    const streamCursor = afterKey ? encodeCursorV1({ visitorId, after: afterKey }) : undefined;

    let merged: ReturnType<typeof mergeTimelines> = [];

    // We may need to pull more than one page from each stream to fill `limit` after merge,
    // but keep it bounded.
    let engagementCursor: string | undefined = streamCursor;
    let formationCursor: string | undefined = streamCursor;

    let engagementDone = false;
    let formationDone = false;

    for (let i = 0; i < maxIters; i++) {
      const engagementPage = engagementDone
        ? { items: [], nextCursor: null }
        : await this.engagementRepo.readTimeline(visitorId, perStream, engagementCursor);

      const formationPage = formationDone
        ? { items: [], nextCursor: null }
        : await this.formationRepo.listByVisitor({ visitorId, limit: perStream, cursor: formationCursor });

      const engagementItems = (engagementPage.items ?? []);
      const formationItems = (formationPage.items ?? []);

      // Merge everything we have so far (de-dupe via stableKey)
      const roundMerged = mergeTimelines(engagementItems, formationItems);

      // Accumulate into a map so we don't duplicate across iterations
      const map = new Map<string, any>();
      for (const e of merged) map.set(makeStableKey(e), e);
      for (const e of roundMerged) map.set(makeStableKey(e), e);

      merged = Array.from(map.values());
      merged.sort((x, y) => makeStableKey(x).localeCompare(makeStableKey(y)));

      // Apply afterKey filter (defensive, in case a repo cursor implementation differs)
      const filtered = afterKey ? merged.filter(e => makeStableKey(e) > afterKey) : merged;

      if (filtered.length >= (limit + 1)) {
        // We have enough to determine nextCursor
        const pageItems = filtered.slice(0, limit);
        const hasMore = filtered.length > limit;

        const nextCursor =
          hasMore && pageItems.length > 0
            ? encodeCursorV1({ visitorId, after: makeStableKey(pageItems[pageItems.length - 1]) })
            : null;

        return { items: pageItems, nextCursor };
      }

      // Advance cursors; stop when a stream is exhausted
      engagementCursor = engagementPage.nextCursor ?? undefined;
      formationCursor = formationPage.nextCursor ?? undefined;

      if (!engagementCursor) engagementDone = true;
      if (!formationCursor) formationDone = true;

      if (engagementDone && formationDone) break;
    }

    // Final page calculation (may be short if data is sparse)
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

