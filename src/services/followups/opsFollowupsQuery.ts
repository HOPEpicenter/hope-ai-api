export type OpsFollowupsQueryInput = {
  limit?: unknown;
  cursor?: unknown;
  assignedTo?: unknown;
  visitorId?: unknown;
  includeResolved?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
};

export type NormalizedOpsFollowupsQuery = {
  limit: number;
  cursor: number;
  assignedToFilter: string;
  visitorIdFilter: string;
  includeResolved: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
};

export function readQueryValue(source: any, name: string): unknown {
  const value = source?.[name];
  if (Array.isArray(value)) return value[0];
  if (value !== undefined) return value;

  if (typeof source?.get === "function") {
    return source.get(name);
  }

  return undefined;
}

export function normalizeOpsFollowupsQuery(input: OpsFollowupsQueryInput): NormalizedOpsFollowupsQuery {
  return {
    limit: parsePositiveInt(input.limit, 25, 100),
    cursor: parseNonNegativeInt(input.cursor, 0),
    assignedToFilter: String(firstValue(input.assignedTo) ?? "").trim(),
    visitorIdFilter: String(firstValue(input.visitorId) ?? "").trim(),
    includeResolved: String(firstValue(input.includeResolved) ?? "").trim().toLowerCase() === "true",
    sortBy: String(firstValue(input.sortBy) ?? "").trim(),
    sortDir: String(firstValue(input.sortDir) ?? "").trim().toLowerCase() === "asc" ? "asc" : "desc",
  };
}

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(firstValue(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(firstValue(value));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}