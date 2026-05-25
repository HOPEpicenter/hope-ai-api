export type NormalizedIntegrationQuery = {
  limit: number;
  cursor?: string;
  debugShadow: boolean;
};

export function normalizeIntegrationQuery(input: {
  limit?: unknown;
  cursor?: unknown;
  debugShadow?: unknown;
}): NormalizedIntegrationQuery {
  const rawLimit =
    typeof input.limit === "number"
      ? input.limit
      : parseInt(String(input.limit ?? "50"), 10);

  const limit =
    Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(200, rawLimit))
      : 50;

  const cursor =
    typeof input.cursor === "string" &&
    input.cursor.trim().length > 0
      ? input.cursor.trim()
      : undefined;

  const debugRaw =
    String(input.debugShadow ?? "")
      .trim()
      .toLowerCase();

  const debugShadow =
    debugRaw === "1" ||
    debugRaw === "true";

  return {
    limit,
    cursor,
    debugShadow
  };
}
