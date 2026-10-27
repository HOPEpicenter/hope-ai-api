/**
 * Evidence-only assessment of formation-event consistency across the three
 * non-atomic writes performed by recordFormationEvent:
 *   formation event -> Global Timeline entry -> FormationProfile snapshot.
 *
 * Pure and deterministic: no storage, network, clock, logging, retries or repairs.
 *
 * Interpretation limits (all results):
 * - Observations are supplied by the caller and are NOT a transactionally consistent
 *   snapshot; the three tables are never read atomically.
 * - Results are never authoritative and never permit repair, retry or execution.
 * - "Observed absence" (an entry not seen by a read the caller declares complete) is
 *   not "proven historical absence": a later or concurrent write may exist or may
 *   have existed. "missing_timeline_observation" means absence within the supplied,
 *   caller-declared-complete observation only; it grants no retry or repair permission.
 * - A "contradictory" result is local to the supplied observations (e.g. an available
 *   profile may be reported even when the timeline is unavailable) and does not
 *   establish that all tables were completely inspected.
 * - "consistent_observation" requires every observation to be available, complete,
 *   well-formed and agreeing; any unavailable, incomplete or malformed input prevents it.
 *
 * Row keys: the canonical key builders (recordFormationEvent makeRowKey and
 * GlobalTimelineRepository buildRowKey) are private, and importing the timeline
 * repository has import-time environment dependencies. They are deliberately not
 * duplicated here, so row keys are only required to be present non-empty strings and
 * exact row-key derivation is NOT verified.
 */

import type { GlobalTimelineEntity } from "../../repositories/globalTimelineRepository";
import type { FormationEventEntity } from "../../storage/formation/formationEventsRepo";
import type { FormationProfileEntity } from "../../storage/formation/formationProfilesRepo";

/** Fields are `unknown` so malformed observations can be represented and rejected conservatively. */
type Loose<T> = { readonly [K in keyof T]?: unknown };

export type FormationEventEvidenceRecord = Loose<
  Pick<
    FormationEventEntity,
    "partitionKey" | "rowKey" | "id" | "visitorId" | "type" | "occurredAt"
  >
>;

export type TimelineEvidenceRecord = Loose<
  Pick<
    GlobalTimelineEntity,
    "partitionKey" | "rowKey" | "eventId" | "visitorId" | "stream" | "type" | "occurredAt"
  >
>;

export type ProfileEvidenceRecord = Loose<
  Pick<
    FormationProfileEntity,
    "partitionKey" | "rowKey" | "visitorId" | "lastEventId" | "lastEventAt" | "lastEventType"
  >
>;

export type EventObservation =
  | { readonly availability: "available"; readonly record: FormationEventEvidenceRecord }
  | { readonly availability: "partial" | "unavailable" };

export type TimelineObservation =
  | {
      readonly availability: "available";
      /** The potential matching entry, or null when none was observed. */
      readonly candidate: TimelineEvidenceRecord | null;
      /**
       * Only meaningful when candidate is null. "complete" is an UNVERIFIED caller
       * assertion that the read could not have missed an entry for this event. This
       * function cannot validate storage provenance, freshness, pagination exhaustion
       * or concurrent writes. Array length, page size or a missing continuation token
       * are never inferred as completeness.
       */
      readonly absenceEvidence: "complete" | "partial" | "unknown";
    }
  | { readonly availability: "unavailable" };

export type ProfileObservation =
  | { readonly availability: "available"; readonly record: ProfileEvidenceRecord }
  | { readonly availability: "absent_observed" | "unavailable" };

export type FormationEventConsistencyEvidenceInput = {
  readonly event: EventObservation;
  readonly timeline: TimelineObservation;
  readonly profile: ProfileObservation;
};

export type FormationEventConsistencyStatus =
  | "consistent_observation"
  | "missing_timeline_observation"
  | "profile_gap_observation"
  | "contradictory"
  | "incomplete";

export type FormationEventConsistencyReasonCode =
  // consistent_observation
  | "event_timeline_profile_agree"
  | "profile_reflects_inspected_event"
  | "profile_reflects_newer_event"
  | "profile_reflects_newer_event_by_id_tiebreak"
  // missing_timeline_observation
  | "timeline_absent_in_complete_evidence"
  // profile_gap_observation
  | "profile_absent_observed"
  | "profile_snapshot_missing"
  | "profile_snapshot_older_than_event"
  | "profile_snapshot_older_by_id_tiebreak"
  // contradictory
  | "event_partition_key_mismatch"
  | "timeline_partition_key_mismatch"
  | "timeline_stream_mismatch"
  | "timeline_event_id_mismatch"
  | "timeline_visitor_id_mismatch"
  | "timeline_event_type_mismatch"
  | "timeline_occurred_at_mismatch"
  | "profile_identity_mismatch"
  | "profile_same_event_id_conflict"
  // incomplete
  | "invalid_input"
  | "event_unavailable"
  | "event_partial"
  | "event_identity_malformed"
  | "event_timestamp_incomparable"
  | "timeline_unavailable"
  | "timeline_candidate_malformed"
  | "timeline_absence_not_established"
  | "profile_unavailable"
  | "profile_record_malformed"
  | "profile_timestamp_incomparable"
  | "profile_event_type_missing"
  | "profile_tiebreak_evidence_missing";

export type FormationEventConsistencyAssessment = {
  readonly status: FormationEventConsistencyStatus;
  readonly reasonCode: FormationEventConsistencyReasonCode;
  readonly authoritative: false;
  readonly repairPermitted: false;
  readonly retryPermitted: false;
  readonly executionPermitted: false;
  /** Observations are never a cross-table atomic or transactionally consistent snapshot. */
  readonly atomicSnapshotClaimed: false;
};

function result(
  status: FormationEventConsistencyStatus,
  reasonCode: FormationEventConsistencyReasonCode
): FormationEventConsistencyAssessment {
  return {
    status,
    reasonCode,
    authoritative: false,
    repairPermitted: false,
    retryPermitted: false,
    executionPermitted: false,
    atomicSnapshotClaimed: false
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

type NormalizedEvent = {
  id: string;
  visitorId: string;
  type: string;
  occurredAt: string;
  occurredAtMs: number;
};

function assess(
  input: FormationEventConsistencyEvidenceInput
): FormationEventConsistencyAssessment {
  if (!isRecord(input) || !isRecord(input.event) || !isRecord(input.timeline) || !isRecord(input.profile)) {
    return result("incomplete", "invalid_input");
  }

  // --- Event ---
  const eventObs = input.event as Record<string, unknown>;
  if (eventObs.availability === "unavailable") return result("incomplete", "event_unavailable");
  if (eventObs.availability === "partial") return result("incomplete", "event_partial");
  if (eventObs.availability !== "available" || !isRecord(eventObs.record)) {
    return result("incomplete", "invalid_input");
  }

  const e = eventObs.record;
  const eventPartition = str(e.partitionKey);
  const eventRowKey = str(e.rowKey);
  const id = str(e.id);
  const visitorId = str(e.visitorId);
  const type = str(e.type);
  const occurredAt = str(e.occurredAt);

  if (!eventPartition || !eventRowKey || !id || !visitorId || !type || !occurredAt) {
    return result("incomplete", "event_identity_malformed");
  }
  if (eventPartition !== visitorId) return result("contradictory", "event_partition_key_mismatch");

  const occurredAtMs = parseMs(occurredAt);
  if (occurredAtMs === undefined) return result("incomplete", "event_timestamp_incomparable");

  const event: NormalizedEvent = { id, visitorId, type, occurredAt, occurredAtMs };

  // --- Timeline: positive contradicting evidence is reported even if absence evidence is weak ---
  const tl = input.timeline as Record<string, unknown>;
  if (tl.availability !== "unavailable" && tl.availability !== "available") {
    return result("incomplete", "invalid_input");
  }

  let timelineAbsent = false;
  if (tl.availability === "available") {
    if (tl.candidate === null) {
      if (tl.absenceEvidence !== "complete" && tl.absenceEvidence !== "partial" && tl.absenceEvidence !== "unknown") {
        return result("incomplete", "invalid_input");
      }
      timelineAbsent = true;
    } else {
      if (!isRecord(tl.candidate)) return result("incomplete", "timeline_candidate_malformed");
      const c = tl.candidate;
      const cPartition = str(c.partitionKey);
      const cRowKey = str(c.rowKey);
      const cEventId = str(c.eventId);
      const cVisitorId = str(c.visitorId);
      const cStream = str(c.stream);
      const cType = str(c.type);
      const cOccurredAt = str(c.occurredAt);

      if (!cPartition || !cRowKey || !cEventId || !cVisitorId || !cStream || !cType || !cOccurredAt) {
        return result("incomplete", "timeline_candidate_malformed");
      }
      if (cPartition !== "global") return result("contradictory", "timeline_partition_key_mismatch");
      if (cStream !== "formation") return result("contradictory", "timeline_stream_mismatch");
      if (cEventId !== event.id) return result("contradictory", "timeline_event_id_mismatch");
      if (cVisitorId !== event.visitorId) return result("contradictory", "timeline_visitor_id_mismatch");
      if (cType !== event.type) return result("contradictory", "timeline_event_type_mismatch");
      if (cOccurredAt !== event.occurredAt) return result("contradictory", "timeline_occurred_at_mismatch");
    }
  }

  // --- Profile ---
  const pr = input.profile as Record<string, unknown>;
  let profileOutcome: FormationEventConsistencyAssessment | undefined;

  if (pr.availability === "available") {
    profileOutcome = assessProfile(event, pr.record);
    if (profileOutcome.status === "contradictory") return profileOutcome;
  } else if (pr.availability === "absent_observed") {
    profileOutcome = result("profile_gap_observation", "profile_absent_observed");
  } else if (pr.availability === "unavailable") {
    profileOutcome = result("incomplete", "profile_unavailable");
  } else {
    return result("incomplete", "invalid_input");
  }

  // --- Combine, most conservative first ---
  if (tl.availability === "unavailable") return result("incomplete", "timeline_unavailable");
  if (timelineAbsent) {
    if (tl.absenceEvidence !== "complete") return result("incomplete", "timeline_absence_not_established");
    return result("missing_timeline_observation", "timeline_absent_in_complete_evidence");
  }

  if (profileOutcome.status === "consistent_observation") {
    return result("consistent_observation", profileOutcome.reasonCode === "profile_reflects_inspected_event"
      ? "event_timeline_profile_agree"
      : profileOutcome.reasonCode);
  }
  return profileOutcome;
}

function assessProfile(
  event: NormalizedEvent,
  record: unknown
): FormationEventConsistencyAssessment {
  if (!isRecord(record)) return result("incomplete", "profile_record_malformed");

  const partition = str(record.partitionKey);
  const rowKey = str(record.rowKey);
  const visitorId = str(record.visitorId);
  if (!partition || !rowKey || !visitorId) return result("incomplete", "profile_record_malformed");
  if (partition !== "VISITOR" || rowKey !== event.visitorId || visitorId !== event.visitorId) {
    return result("contradictory", "profile_identity_mismatch");
  }

  const lastAt = record.lastEventAt;
  const lastId = record.lastEventId;
  const lastType = record.lastEventType;

  const hasLastAt = lastAt !== undefined && lastAt !== null && !(typeof lastAt === "string" && lastAt.trim() === "");
  if (!hasLastAt) {
    // The recorder always sets the snapshot when none exists, so a profile that exists
    // without one has not (yet) reflected any event. Still an observation, not proof.
    return result("profile_gap_observation", "profile_snapshot_missing");
  }

  const lastAtStr = str(lastAt);
  if (lastAtStr === undefined) return result("incomplete", "profile_timestamp_incomparable");
  const lastMs = parseMs(lastAtStr);
  if (lastMs === undefined) return result("incomplete", "profile_timestamp_incomparable");

  const lastIdStr = str(lastId);

  if (lastIdStr === event.id) {
    if (lastMs !== event.occurredAtMs) return result("contradictory", "profile_same_event_id_conflict");
    // A missing or malformed type is insufficient evidence, not a conflict.
    const lastTypeStr = str(lastType);
    if (lastTypeStr === undefined) return result("incomplete", "profile_event_type_missing");
    if (lastTypeStr !== event.type) {
      return result("contradictory", "profile_same_event_id_conflict");
    }
    return result("consistent_observation", "profile_reflects_inspected_event");
  }

  if (lastMs > event.occurredAtMs) return result("consistent_observation", "profile_reflects_newer_event");
  if (lastMs < event.occurredAtMs) return result("profile_gap_observation", "profile_snapshot_older_than_event");

  // Equal instants: the recorder advances only when the incoming event id sorts after the stored one.
  if (lastIdStr === undefined) return result("incomplete", "profile_tiebreak_evidence_missing");
  return lastIdStr > event.id
    ? result("consistent_observation", "profile_reflects_newer_event_by_id_tiebreak")
    : result("profile_gap_observation", "profile_snapshot_older_by_id_tiebreak");
}

export function assessFormationEventConsistencyEvidence(
  input: FormationEventConsistencyEvidenceInput
): FormationEventConsistencyAssessment {
  try {
    return assess(input);
  } catch {
    return result("incomplete", "invalid_input");
  }
}
