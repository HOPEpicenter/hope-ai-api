import type {
  MinistryHealthScore,
  PersonAggregate,
  ReadinessSignalItem,
  SnapshotRailV2,
  TimelineEvent,
} from "../domain/aggregation/phase4Contracts";

/** Phase 4 read-endpoint DTOs. Route implementation belongs to PR-3. */
export type PersonAggregationPathParamsV1 = {
  id: string;
};

export type PersonTimelineQueryV1 = {
  limit?: number;
  before?: string;
};

export type PersonAggregateResponseV1 = {
  ok: true;
  aggregate: PersonAggregate;
};

export type PersonTimelineResponseV1 = {
  ok: true;
  visitorId: string;
  timeline: TimelineEvent[];
  nextCursor: string | null;
};

export type PersonReadinessResponseV1 = {
  ok: true;
  visitorId: string;
  readiness: ReadinessSignalItem[];
  ministryHealth: MinistryHealthScore;
};

export type PersonSnapshotResponseV1 = {
  ok: true;
  visitorId: string;
  snapshot: SnapshotRailV2;
};

export type PersonAggregationErrorResponseV1 = {
  ok: false;
  code: "PERSON_NOT_FOUND" | "PHASE4_AGGREGATION_DISABLED";
  message: string;
};
