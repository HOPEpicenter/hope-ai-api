import { getTableClient } from "../storage/tableClient";
import { randomUUID } from "crypto";

export type FormationEventType =
  | "note"
  | "message"
  | "call"
  | "visit"
  | "prayer"
  | "follow_up"
  | "other";

export type FormationEventEntity = {
  partitionKey: string; // visitorId
  rowKey: string; // sortable key
  visitorId: string;
  type: FormationEventType;
  occurredAt: string; // ISO
  summary?: string;
  metadataJson?: string; // JSON string
  createdAt: string; // ISO
};

export type FormationEvent = {
  visitorId: string;
  eventId: string; // derived from rowKey
  type: FormationEventType;
  occurredAt: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export interface FormationEventsRepository {
  append(input: {
    visitorId: string;
    type: FormationEventType;
    occurredAt: string; // ISO
    summary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<FormationEvent>;

  listByVisitor(input: {
    visitorId: string;
    limit: number;
    cursor?: string; // opaque base64(rowKey)
  }): Promise<Page<FormationEvent>>;
}

const TABLE = "FormationEvents";

// Guardrails (keep conservative; can tune later)
const SUMMARY_MAX = 1024;
const METADATA_JSON_MAX = 12 * 1024; // 12KB

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * We want newest-first in timelines, but Table queries return ascending by RowKey.
 * Store RowKey as inverted timestamp so ascending == newest first.
 * RowKey: <invertedMillis13>_<uuid>
 */
function toInvertedMillis(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new Error(`Invalid occurredAt ISO: ${iso}`);
  const MAX = 9999999999999; // ~ year 2286
  const inv = MAX - t;
  return String(inv).padStart(13, "0");
}

function makeRowKey(occurredAtIso: string): string {
  return `${toInvertedMillis(occurredAtIso)}_${randomUUID()}`;
}

function encodeCursor(rowKey: string): string {
  return Buffer.from(rowKey, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, "base64").toString("utf8");
}

function toEvent(e: FormationEventEntity): FormationEvent {
  return {
    visitorId: e.visitorId,
    eventId: e.rowKey,
    type: e.type,
    occurredAt: e.occurredAt,
    summary: e.summary,
    metadata: e.metadataJson ? (JSON.parse(e.metadataJson) as Record<string, unknown>) : undefined,
    createdAt: e.createdAt,
  };
}

function clampString(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

export class AzureTableFormationEventsRepository implements FormationEventsRepository {
  async append(input: {
    visitorId: string;
    type: FormationEventType;
    occurredAt: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<FormationEvent> {
    const table = await getTableClient(TABLE);
    const createdAt = nowIso();

    const summary =
      typeof input.summary === "string" && input.summary.length > 0
        ? clampString(input.summary, SUMMARY_MAX)
        : undefined;

    let metadataJson: string | undefined = undefined;
    if (input.metadata) {
      metadataJson = JSON.stringify(input.metadata);
      if (metadataJson.length > METADATA_JSON_MAX) {
        // Fail fast - callers should decide what to trim.
        throw new Error(`metadata too large: ${metadataJson.length} bytes (max ${METADATA_JSON_MAX})`);
      }
    }

    const entity: FormationEventEntity = {
      partitionKey: input.visitorId,
      rowKey: makeRowKey(input.occurredAt),
      visitorId: input.visitorId,
      type: input.type,
      occurredAt: input.occurredAt,
      summary,
      metadataJson,
      createdAt,
    };

    await table.createEntity(entity);
    return toEvent(entity);
  }

  async listByVisitor(input: { visitorId: string; limit: number; cursor?: string }): Promise<Page<FormationEvent>> {
    const table = await getTableClient(TABLE);
    const limit = Math.max(1, Math.min(200, input.limit || 50));

    const startAfterRowKey = input.cursor ? decodeCursor(input.cursor) : null;

    const pkEscaped = input.visitorId.replace(/'/g, "''");
    const parts: string[] = [`PartitionKey eq '${pkEscaped}'`];
    if (startAfterRowKey) {
      parts.push(`RowKey gt '${startAfterRowKey.replace(/'/g, "''")}'`);
    }
    const filter = parts.join(" and ");

    const items: FormationEvent[] = [];
    let lastRowKey: string | null = null;

    const iter = table.listEntities<FormationEventEntity>({
      queryOptions: { filter },
    });

    for await (const e of iter) {
      items.push(toEvent(e));
      lastRowKey = e.rowKey;
      if (items.length >= limit) break;
    }

    const nextCursor = items.length === limit && lastRowKey ? encodeCursor(lastRowKey) : null;
    return { items, nextCursor };
  }
}
