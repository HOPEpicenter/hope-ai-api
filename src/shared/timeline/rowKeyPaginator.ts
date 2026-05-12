export function compareRowKeyAscending(
  a: { rowKey: string },
  b: { rowKey: string }
): number {
  if (a.rowKey === b.rowKey) return 0;
  return a.rowKey < b.rowKey ? -1 : 1;
}

export function paginateRowKeyItems<T extends { rowKey: string }>(
  items: T[],
  limit: number
): {
  items: T[];
  nextCursor: string | null;
} {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));

  const ordered = items
    .slice()
    .sort(compareRowKeyAscending);

  const pageItems = ordered.slice(0, safeLimit);

  const nextCursor =
    ordered.length > safeLimit
      ? pageItems[pageItems.length - 1]?.rowKey ?? null
      : null;

  return {
    items: pageItems,
    nextCursor
  };
}
