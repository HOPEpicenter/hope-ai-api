import assert from "node:assert/strict";
import {
  FormationEventConsistencyAssessment,
  FormationEventConsistencyEvidenceInput,
  FormationEventConsistencyReasonCode,
  FormationEventConsistencyStatus,
  assessFormationEventConsistencyEvidence
} from "../../src/domain/formation/assessFormationEventConsistencyEvidence";

// Synthetic, in-memory fixtures only. No storage, SDK clients or network.

const VISITOR = "synthetic-visitor-001";
const EVENT_ID = "synthetic-event-100";
const AT = "2030-01-01T00:00:00.000Z";
const LATER = "2030-01-01T00:00:01.000Z";
const EARLIER = "2029-12-31T23:59:59.000Z";

type Overrides = {
  event?: Record<string, unknown>;
  timeline?: Record<string, unknown> | null;
  profile?: Record<string, unknown>;
};

function build(o: Overrides = {}): FormationEventConsistencyEvidenceInput {
  return {
    event: {
      availability: "available",
      record: {
        partitionKey: VISITOR,
        rowKey: `row-${EVENT_ID}`,
        id: EVENT_ID,
        visitorId: VISITOR,
        type: "SERVICE_ATTENDED",
        occurredAt: AT,
        ...o.event
      }
    },
    timeline: {
      availability: "available",
      absenceEvidence: "unknown",
      candidate:
        o.timeline === null
          ? null
          : {
              partitionKey: "global",
              rowKey: `tl-${EVENT_ID}`,
              eventId: EVENT_ID,
              visitorId: VISITOR,
              stream: "formation",
              type: "SERVICE_ATTENDED",
              occurredAt: AT,
              ...o.timeline
            }
    },
    profile: {
      availability: "available",
      record: {
        partitionKey: "VISITOR",
        rowKey: VISITOR,
        visitorId: VISITOR,
        lastEventId: EVENT_ID,
        lastEventAt: AT,
        lastEventType: "SERVICE_ATTENDED",
        ...o.profile
      }
    }
  } as FormationEventConsistencyEvidenceInput;
}

function expectResult(
  input: FormationEventConsistencyEvidenceInput,
  status: FormationEventConsistencyStatus,
  reasonCode: FormationEventConsistencyReasonCode
): FormationEventConsistencyAssessment {
  const r = assessFormationEventConsistencyEvidence(input);
  assert.equal(r.status, status);
  assert.equal(r.reasonCode, reasonCode);
  return r;
}

const results: FormationEventConsistencyAssessment[] = [];
let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

function track(r: FormationEventConsistencyAssessment): void {
  results.push(r);
}

test("1. matching event, timeline and profile", () => {
  track(expectResult(build(), "consistent_observation", "event_timeline_profile_agree"));
});

test("2. timeline evidence incomplete (absent, partial / unknown / unavailable)", () => {
  for (const absenceEvidence of ["partial", "unknown"]) {
    const input = build({ timeline: null });
    (input.timeline as { absenceEvidence: string }).absenceEvidence = absenceEvidence;
    track(expectResult(input, "incomplete", "timeline_absence_not_established"));
  }
  const unavailable = build();
  (unavailable as { timeline: unknown }).timeline = { availability: "unavailable" };
  track(expectResult(unavailable, "incomplete", "timeline_unavailable"));
});

test("3. timeline absent from explicitly complete evidence", () => {
  const input = build({ timeline: null });
  (input.timeline as { absenceEvidence: string }).absenceEvidence = "complete";
  track(expectResult(input, "missing_timeline_observation", "timeline_absent_in_complete_evidence"));
});

test("4. timeline event-id mismatch", () => {
  track(expectResult(build({ timeline: { eventId: "synthetic-other" } }), "contradictory", "timeline_event_id_mismatch"));
});

test("5. timeline visitor-id mismatch", () => {
  track(expectResult(build({ timeline: { visitorId: "synthetic-other" } }), "contradictory", "timeline_visitor_id_mismatch"));
});

test("6. timeline event-type mismatch", () => {
  track(expectResult(build({ timeline: { type: "PRAYER_REQUESTED" } }), "contradictory", "timeline_event_type_mismatch"));
});

test("7. timeline occurrence-time mismatch", () => {
  track(expectResult(build({ timeline: { occurredAt: LATER } }), "contradictory", "timeline_occurred_at_mismatch"));
});

test("7b. timeline partition and stream mismatch", () => {
  track(expectResult(build({ timeline: { partitionKey: "other" } }), "contradictory", "timeline_partition_key_mismatch"));
  track(expectResult(build({ timeline: { stream: "engagement" } }), "contradictory", "timeline_stream_mismatch"));
});

test("7c. malformed timeline candidate is incomplete, not contradictory", () => {
  track(expectResult(build({ timeline: { eventId: undefined } }), "incomplete", "timeline_candidate_malformed"));
  track(expectResult(build({ timeline: { rowKey: "" } }), "incomplete", "timeline_candidate_malformed"));
});

test("8. wrong or malformed formation event identity", () => {
  track(expectResult(build({ event: { partitionKey: "synthetic-other" } }), "contradictory", "event_partition_key_mismatch"));
  track(expectResult(build({ event: { id: undefined } }), "incomplete", "event_identity_malformed"));
  track(expectResult(build({ event: { visitorId: 42 } }), "incomplete", "event_identity_malformed"));
  track(expectResult(build({ event: { occurredAt: "not-a-date" } }), "incomplete", "event_timestamp_incomparable"));
  const unavailable = build();
  (unavailable as { event: unknown }).event = { availability: "unavailable" };
  track(expectResult(unavailable, "incomplete", "event_unavailable"));
  const partial = build();
  (partial as { event: unknown }).event = { availability: "partial" };
  track(expectResult(partial, "incomplete", "event_partial"));
});

test("8b. invalid input shapes", () => {
  for (const bad of [null, undefined, 5, "x", {}, { event: null }]) {
    track(expectResult(bad as unknown as FormationEventConsistencyEvidenceInput, "incomplete", "invalid_input"));
  }
});

test("9. profile missing or unavailable", () => {
  const absent = build();
  (absent as { profile: unknown }).profile = { availability: "absent_observed" };
  track(expectResult(absent, "profile_gap_observation", "profile_absent_observed"));

  const unavailable = build();
  (unavailable as { profile: unknown }).profile = { availability: "unavailable" };
  track(expectResult(unavailable, "incomplete", "profile_unavailable"));

  // Existing profile without any snapshot has not reflected the event.
  track(expectResult(build({ profile: { lastEventAt: undefined, lastEventId: undefined } }), "profile_gap_observation", "profile_snapshot_missing"));

  // Older snapshot is a gap observation only, never a proven failed write.
  track(expectResult(build({ profile: { lastEventAt: EARLIER, lastEventId: "synthetic-older" } }), "profile_gap_observation", "profile_snapshot_older_than_event"));
});

test("9b. missing timeline takes precedence over profile unavailability, but not over contradictions", () => {
  const input = build({ timeline: null });
  (input.timeline as { absenceEvidence: string }).absenceEvidence = "complete";
  (input as { profile: unknown }).profile = { availability: "unavailable" };
  track(expectResult(input, "missing_timeline_observation", "timeline_absent_in_complete_evidence"));

  const contradicted = build({ timeline: null, profile: { visitorId: "synthetic-other" } });
  (contradicted.timeline as { absenceEvidence: string }).absenceEvidence = "complete";
  track(expectResult(contradicted, "contradictory", "profile_identity_mismatch"));
});

test("10. same event id and timestamp but missing/malformed profile event type cannot be consistent", () => {
  for (const lastEventType of [undefined, null, "", "   ", 42, {}]) {
    track(expectResult(build({ profile: { lastEventType } }), "incomplete", "profile_event_type_missing"));
  }
  // A well-formed matching type remains consistent; a well-formed conflicting type is contradictory.
  track(expectResult(build({ profile: { lastEventType: "SERVICE_ATTENDED" } }), "consistent_observation", "event_timeline_profile_agree"));
  track(expectResult(build({ profile: { lastEventType: "PRAYER_REQUESTED" } }), "contradictory", "profile_same_event_id_conflict"));
});

test("10b. precedence: local profile contradiction survives unavailable timeline; incomplete timeline blocks consistency", () => {
  const unavailable = build({ profile: { lastEventType: "PRAYER_REQUESTED" } });
  (unavailable as { timeline: unknown }).timeline = { availability: "unavailable" };
  track(expectResult(unavailable, "contradictory", "profile_same_event_id_conflict"));

  // Malformed profile fields are not promoted to contradictions.
  const malformed = build({ profile: { lastEventType: 42 } });
  (malformed as { timeline: unknown }).timeline = { availability: "unavailable" };
  track(expectResult(malformed, "incomplete", "timeline_unavailable"));

  // Otherwise fully agreeing evidence with incomplete timeline evidence is never consistent.
  for (const absenceEvidence of ["partial", "unknown"]) {
    const input = build({ timeline: null });
    (input.timeline as { absenceEvidence: string }).absenceEvidence = absenceEvidence;
    const r = assessFormationEventConsistencyEvidence(input);
    assert.notEqual(r.status, "consistent_observation");
    track(r);
  }
  const unavailableTimeline = build();
  (unavailableTimeline as { timeline: unknown }).timeline = { availability: "unavailable" };
  assert.notEqual(assessFormationEventConsistencyEvidence(unavailableTimeline).status, "consistent_observation");
});

test("11. profile legitimately reflects a newer event", () => {
  track(expectResult(
    build({ profile: { lastEventId: "synthetic-event-200", lastEventAt: LATER, lastEventType: "PRAYER_REQUESTED" } }),
    "consistent_observation",
    "profile_reflects_newer_event"
  ));
});

test("12. equal-timestamp event-id ordering", () => {
  track(expectResult(
    build({ profile: { lastEventId: "synthetic-event-200" } }),
    "consistent_observation",
    "profile_reflects_newer_event_by_id_tiebreak"
  ));
  track(expectResult(
    build({ profile: { lastEventId: "synthetic-event-050" } }),
    "profile_gap_observation",
    "profile_snapshot_older_by_id_tiebreak"
  ));
  track(expectResult(
    build({ profile: { lastEventId: undefined } }),
    "incomplete",
    "profile_tiebreak_evidence_missing"
  ));
});

test("13. malformed or incomparable profile timestamp", () => {
  for (const lastEventAt of ["not-a-date", 12345, {}]) {
    track(expectResult(build({ profile: { lastEventAt } }), "incomplete", "profile_timestamp_incomparable"));
  }
  track(expectResult(build({ profile: { partitionKey: undefined } }), "incomplete", "profile_record_malformed"));
});

test("14. conflicting profile evidence", () => {
  track(expectResult(build({ profile: { partitionKey: "OTHER" } }), "contradictory", "profile_identity_mismatch"));
  track(expectResult(build({ profile: { rowKey: "synthetic-other" } }), "contradictory", "profile_identity_mismatch"));
  track(expectResult(build({ profile: { lastEventAt: LATER } }), "contradictory", "profile_same_event_id_conflict"));
  track(expectResult(build({ profile: { lastEventType: "PRAYER_REQUESTED" } }), "contradictory", "profile_same_event_id_conflict"));
});

test("15. every result retains the four literal false safety properties", () => {
  assert.ok(results.length >= 30);
  for (const r of results) {
    assert.equal(r.authoritative, false);
    assert.equal(r.repairPermitted, false);
    assert.equal(r.retryPermitted, false);
    assert.equal(r.executionPermitted, false);
    assert.equal(r.atomicSnapshotClaimed, false);
  }
  const statuses = new Set(results.map(r => r.status));
  for (const s of [
    "consistent_observation",
    "missing_timeline_observation",
    "profile_gap_observation",
    "contradictory",
    "incomplete"
  ]) {
    assert.ok(statuses.has(s as FormationEventConsistencyStatus), `status not exercised: ${s}`);
  }
});

test("16. deterministic and non-mutating", () => {
  const input = build({ profile: { lastEventId: "synthetic-event-200" } });
  const snapshot = JSON.stringify(input);
  const first = assessFormationEventConsistencyEvidence(input);
  const second = assessFormationEventConsistencyEvidence(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);

  const frozen = JSON.parse(snapshot) as FormationEventConsistencyEvidenceInput;
  Object.freeze(frozen);
  Object.freeze(frozen.event);
  Object.freeze(frozen.timeline);
  Object.freeze(frozen.profile);
  assert.deepEqual(assessFormationEventConsistencyEvidence(frozen), first);
});

console.log(`Formation event consistency evidence assertions passed (${passed} tests).`);
