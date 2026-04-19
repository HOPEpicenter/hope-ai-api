export type NormalizedTimelineKind =
  | "engagement"
  | "formation"
  | "integration"
  | "system";

export type NormalizedTimelineItem = {
  id: string;
  visitorId: string | null;
  kind: NormalizedTimelineKind;
  eventType: string;
  happenedAt: string | null;
  summary: string;
  actor: string | null;
  source: string;
  raw: unknown;
};
