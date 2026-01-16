// src/shared/timeline/timelineQuery.ts

import { TableClient } from "@azure/data-tables";

export type TimelineCursor = {
  t?: string;   // occurredAt ISO anchor
  rk?: string;  // RowKey tie-breaker
};

export function encodeCursor(c: TimelineCursor): string {
  const json = JSON.stringify(c || {});
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCursor(cursor: string): TimelineCursor | null {
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((cursor.length + 3) % 4);
    const json = Buffer.from(b64, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj as TimelineCursor;
  } catch {
    return null;
  }
}

export function getRowKey(row: any): string {
  return String(row?.rowKey ?? row?.RowKey ?? row?.eventId ?? row?.engagementId ?? "");
}

function escapeOdataString(s: string): string {
  return String(s).replace(/'/g, "''");
}

function pickOccurredAt(row: any): string | null {
  const o = row?.occurredAt;
  if (typeof o === "string" && o) return o;

  const r = row?.recordedAt;
  if (typeof r === "string" && r) return r;

  const u = row?.updatedAt;
  if (typeof u === "string" && u) return u;

  return null;
}

export type ListByVisitorResult<T extends object> = {
  usedStrategy: "visitorId" | "partitionKey";
  usedFilter: string;
  rows: T[];
};

/**
 * listByVisitorWithFallback
 * - Prefer filtering by visitorId eq '{id}'
 * - If it yields 0 rows, fallback to PartitionKey eq '{id}'
 * Cursor semantics (cross-table safe):
 * - Use occurredAt anchor when present: occurredAt lt cursor.t
 * - Tie-breaker (same occurredAt): RowKey lt cursor.rk
 */
export async function listByVisitorWithFallback<T extends object = any>(
  table: TableClient,
  visitorId: string,
  cursor: TimelineCursor | null,
  take: number
): Promise<ListByVisitorResult<T>> {
  const vid = escapeOdataString(visitorId);

  const cursorT = cursor?.t ? escapeOdataString(String(cursor.t)) : null;
  const cursorRk = cursor?.rk ? escapeOdataString(String(cursor.rk)) : null;

  function applyCursor(base: string): string {
    // If no cursor, just base filter.
    if (!cursorT) return base;

    // Cross-table safe: primarily page by occurredAt.
    // If occurredAt is equal to cursor.t, use RowKey tie-breaker when provided.
    if (cursorRk) {
      return `(${base}) and (occurredAt lt '${cursorT}' or (occurredAt eq '${cursorT}' and RowKey lt '${cursorRk}'))`;
    }
    return `(${base}) and occurredAt lt '${cursorT}'`;
  }

  async function fetch(filter: string): Promise<T[]> {
    const rows: T[] = [];
    for await (const e of table.listEntities<any>({ queryOptions: { filter } })) {
      rows.push(e as T);
      if (rows.length >= take) break;
    }
    return rows;
  }

  // Strategy A: visitorId property
  const filterA = applyCursor(`visitorId eq '${vid}'`);
  let rows = await fetch(filterA);
  if (rows.length > 0) return { usedStrategy: "visitorId", usedFilter: filterA, rows };

  // Strategy B: PartitionKey fallback
  const filterB = applyCursor(`PartitionKey eq '${vid}'`);
  rows = await fetch(filterB);
  return { usedStrategy: "partitionKey", usedFilter: filterB, rows };
}

/**
 * Compute a cursor from the last returned item.
 * We encode both time anchor and RowKey tie-breaker.
 */
export function cursorFromLast(row: any): TimelineCursor | null {
  if (!row) return null;
  const t = pickOccurredAt(row);
  const rk = getRowKey(row);
  if (!t && !rk) return null;
  return { t: t ?? undefined, rk: rk || undefined };
}
