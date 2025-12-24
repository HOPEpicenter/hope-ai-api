import { cleanTableEntity } from "../../shared/storage/cleanTableEntity";

export function toFormationProfileDto(profile: unknown) {
  return cleanTableEntity(profile as any);
}

export type FormationEventDto = {
  eventId: string;
  visitorId: string;
  type: string;
  occurredAt?: string | null;
  recordedAt?: string | null;
  channel?: string | null;
  visibility?: string | null;
  sensitivity?: string | null;
  summary?: string | null;
  metadata?: any;
};

export function toFormationEventDto(e: any): FormationEventDto {
  return {
    eventId: String(e?.eventId ?? e?.rowKey ?? e?.RowKey ?? ""),
    visitorId: String(e?.visitorId ?? e?.partitionKey ?? e?.PartitionKey ?? ""),
    type: String(e?.type ?? e?.eventType ?? ""),
    occurredAt: e?.occurredAt ?? null,
    recordedAt: e?.recordedAt ?? e?.timestamp ?? e?.Timestamp ?? null,
    channel: e?.channel ?? null,
    visibility: e?.visibility ?? null,
    sensitivity: e?.sensitivity ?? null,
    summary: e?.summary ?? null,
    metadata: e?.metadata ?? null,
  };
}

