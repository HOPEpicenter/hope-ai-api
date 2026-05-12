import {
  compareTimelineNewestFirst,
  isTimelineItemAfterCursor,
  makeTimelineCursor,
  parseTimelineCursor,
  type TimelineOrderable
} from "./timelineOrdering";

export type TimelinePageResult<T extends TimelineOrderable> = {
  items: T[];
  nextCursor: string | null;
};

export function paginateTimelineItems<T extends TimelineOrderable>(
  items: T[],
  limit: number,
  cursor?: string | null
): TimelinePageResult<T> {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

  let ordered = items
    .slice()
    .sort(compareTimelineNewestFirst);

  if (cursor) {
    const cursorItem = parseTimelineCursor(cursor);

    if (cursorItem) {
      ordered = ordered.filter((item) => {
        if (!item?.occurredAt || !item?.eventId) return false;
        return isTimelineItemAfterCursor(item, cursorItem);
      });
    }
  }

  const pageItems = ordered.slice(0, safeLimit);

  const nextCursor =
    ordered.length > safeLimit && pageItems.length > 0
      ? makeTimelineCursor(pageItems[pageItems.length - 1])
      : null;

  return {
    items: pageItems,
    nextCursor
  };
}
