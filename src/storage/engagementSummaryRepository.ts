import { TableClient } from "@azure/data-tables";
import { resolveStorageConnectionString } from "../shared/storage/resolveStorageConnectionString";
import {
  computeNextEngagementSummary,
  EngagementEventForSummary,
  EngagementSummary,
} from "../domain/engagement/computeEngagementSummary";

type SummaryEntity = {
  partitionKey: string;
  rowKey: string;

  visitorId: string;
  version: number;
  updatedAt: string;

  lastEventRowKey: string;

  eventCount: number;
  firstEngagedAt?: string;
  lastEngagedAt?: string;

  channelsJson: string;
  typesJson: string;

  [key: string]: any;
};

function isoNow(): string {
  return new Date().toISOString();
}

function getConnectionString(): string {
  return resolveStorageConnectionString(
    process.env.STORAGE_CONNECTION_STRING ||
      process.env.AzureWebJobsStorage ||
      ""
  );
}

function getSummariesTableName(): string {
  return process.env.ENGAGEMENT_SUMMARIES_TABLE || "devEngagementSummaries";
}

function safeParseJsonMap(val: any): Record<string, number> {
  if (!val || typeof val !== "string") return {};
  try {
    const obj = JSON.parse(val);
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[String(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function toDomain(e: any): EngagementSummary {
  return {
    visitorId: e.visitorId,
    version: Number(e.version ?? 1),
    updatedAt: e.updatedAt,

    lastEventRowKey: e.lastEventRowKey ?? "",

    eventCount: Number(e.eventCount ?? 0),
    firstEngagedAt: e.firstEngagedAt || undefined,
    lastEngagedAt: e.lastEngagedAt || undefined,

    channels: safeParseJsonMap(e.channelsJson),
    types: safeParseJsonMap(e.typesJson),
  };
}

function toEntity(summary: EngagementSummary): SummaryEntity {
  return {
    partitionKey: summary.visitorId,
    rowKey: "summary",

    visitorId: summary.visitorId,
    version: summary.version,
    updatedAt: summary.updatedAt,

    lastEventRowKey: summary.lastEventRowKey,

    eventCount: summary.eventCount,
    firstEngagedAt: summary.firstEngagedAt ?? "",
    lastEngagedAt: summary.lastEngagedAt ?? "",

    channelsJson: JSON.stringify(summary.channels ?? {}),
    typesJson: JSON.stringify(summary.types ?? {}),
  };
}

export class EngagementSummaryRepository {
  private readonly client: TableClient;

  constructor(client?: TableClient) {
    const cs = getConnectionString();
    if (!cs) {
      throw new Error(
        "Missing STORAGE_CONNECTION_STRING or AzureWebJobsStorage for Table Storage."
      );
    }

    this.client =
      client ??
      TableClient.fromConnectionString(cs, getSummariesTableName(), {
        allowInsecureConnection: true,
      });
  }

  async ensureTable(): Promise<void> {
    await this.client.createTable();
  }

  async get(visitorId: string): Promise<EngagementSummary | null> {
    await this.ensureTable();
    try {
      const e = await this.client.getEntity<any>(visitorId, "summary");
      return toDomain(e);
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Apply a single newly-created engagement event to the per-visitor snapshot.
   * Idempotent: if event.rowKey <= summary.lastEventRowKey, no-op.
   */
  async applyEvent(event: EngagementEventForSummary): Promise<EngagementSummary> {
    await this.ensureTable();

    const nowIso = isoNow();
    const prev = await this.get(event.visitorId);

    // Idempotency / replay safety
    if (prev && prev.lastEventRowKey && event.rowKey <= prev.lastEventRowKey) {
      return prev;
    }

    const next = computeNextEngagementSummary({
      prev,
      event,
      nowIso,
    });

    const entity = toEntity(next);
    await this.client.upsertEntity(entity, "Replace");

    return next;
  }
}