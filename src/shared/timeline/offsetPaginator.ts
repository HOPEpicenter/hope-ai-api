export type OffsetPageResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export function paginateOffsetItems<T>(
  items: T[],
  cursor: number,
  limit: number
): OffsetPageResult<T> {
  const safeCursor = Math.max(0, Number(cursor || 0));
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

  const pageItems = items.slice(
    safeCursor,
    safeCursor + safeLimit
  );

  const nextCursor =
    safeCursor + safeLimit < items.length
      ? String(safeCursor + safeLimit)
      : null;

  return {
    items: pageItems,
    nextCursor
  };
}
