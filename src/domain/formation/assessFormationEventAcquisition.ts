import type {
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionReasonCodeV1,
  FormationEventEvidenceAcquisitionResultV1,
  FormationEventEvidenceAcquisitionStatusV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import { makeDeterministicFormationEventRowKey } from "./formationEventRowKey";

const IDENTITY_KEYS = ["visitorId", "eventId", "occurredAt"] as const;
const INPUT_KEYS = ["identity", "observation"] as const;
const OBSERVATION_KEYS = ["availability", "record"] as const;
const RECORD_REQUIRED_KEYS = ["partitionKey", "rowKey", "visitorId", "id", "occurredAt"] as const;
const RECORD_ALLOWED_KEYS = [
  ...RECORD_REQUIRED_KEYS,
  "type",
  "recordedAt",
  "channel",
  "visibility",
  "sensitivity",
  "summary",
  "metadata",
  "idempotencyKey"
] as const;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FORBIDDEN_TABLE_KEY_CHARACTERS = /[\/\\#?\u0000-\u001f\u007f-\u009f]/;

type Assessment = Pick<
  FormationEventEvidenceAcquisitionResultV1,
  "status" | "reasonCode" | "candidateRowKey"
>;

function result(
  status: FormationEventEvidenceAcquisitionStatusV1,
  reasonCode: FormationEventEvidenceAcquisitionReasonCodeV1,
  candidateRowKey: string | null
): FormationEventEvidenceAcquisitionResultV1 {
  return {
    contractVersion: "formation_event_evidence_acquisition.v1",
    status,
    reasonCode,
    candidateRowKey,
    advisoryOnly: true,
    readOnly: true,
    authoritative: false,
    historicalAbsenceEstablished: false,
    transactionallyComplete: false,
    retryAuthorized: false,
    repairAuthorized: false,
    replayAuthorized: false,
    reconciliationAuthorized: false
  };
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataProperties(value: object, expectedKeys: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || keys.some(key => (
    typeof key !== "string" || !expectedKeys.some(expectedKey => expectedKey === key)
  ))) {
    return false;
  }

  return expectedKeys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function hasAllowedDataProperties(
  value: object,
  requiredKeys: readonly string[],
  allowedKeys: readonly string[]
): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => (
    typeof key !== "string" || !allowedKeys.some(allowedKey => allowedKey === key)
  ))) {
    return false;
  }

  return requiredKeys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
  }) && keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key as string);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function property(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validTableKey(value: string): boolean {
  return value.length <= 1024 && !FORBIDDEN_TABLE_KEY_CHARACTERS.test(value);
}

function validOccurrenceTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function ambiguous(
  reasonCode: FormationEventEvidenceAcquisitionReasonCodeV1,
  candidateRowKey: string | null
): Assessment {
  return { status: "ambiguous", reasonCode, candidateRowKey };
}

function assess(input: unknown): Assessment {
  if (!isPlainObject(input) || !hasExactDataProperties(input, INPUT_KEYS)) {
    return ambiguous("input_malformed", null);
  }

  const identity = property(input, "identity");
  if (!isPlainObject(identity)) {
    return ambiguous("identity_visitor_id_malformed", null);
  }

  const visitorId = property(identity, "visitorId");
  if (!validIdentifier(visitorId)) return ambiguous("identity_visitor_id_malformed", null);
  if (!validTableKey(visitorId)) {
    return ambiguous("identity_visitor_id_invalid_for_partition_key", null);
  }

  const eventId = property(identity, "eventId");
  if (!validIdentifier(eventId)) return ambiguous("identity_event_id_malformed", null);

  const occurredAt = property(identity, "occurredAt");
  if (!validOccurrenceTimestamp(occurredAt)) {
    return ambiguous("identity_occurred_at_invalid", null);
  }
  if (!hasExactDataProperties(identity, IDENTITY_KEYS)) {
    return ambiguous("identity_malformed", null);
  }

  const candidateRowKey = makeDeterministicFormationEventRowKey(occurredAt, eventId);
  if (!validTableKey(candidateRowKey)) {
    return ambiguous("identity_event_id_invalid_for_row_key", null);
  }
  const observation = property(input, "observation");
  if (!isPlainObject(observation)) return ambiguous("observation_malformed", candidateRowKey);

  const availability = property(observation, "availability");
  if (availability === "absent_observed" || availability === "unavailable" || availability === "partial") {
    if (!hasExactDataProperties(observation, ["availability"])) {
      return ambiguous("observation_malformed", candidateRowKey);
    }
    if (availability === "absent_observed") {
      return {
        status: "observed_absence",
        reasonCode: "absence_observed_not_historical",
        candidateRowKey
      };
    }
    if (availability === "unavailable") {
      return { status: "unavailable", reasonCode: "observation_unavailable", candidateRowKey };
    }
    return ambiguous("observation_partial", candidateRowKey);
  }

  if (availability !== "available") {
    return ambiguous("observation_status_invalid", candidateRowKey);
  }
  if (!hasExactDataProperties(observation, OBSERVATION_KEYS)) {
    return ambiguous("observation_malformed", candidateRowKey);
  }

  const record = property(observation, "record");
  if (!isPlainObject(record) || !hasAllowedDataProperties(record, RECORD_REQUIRED_KEYS, RECORD_ALLOWED_KEYS)) {
    return ambiguous("record_malformed", candidateRowKey);
  }

  const partitionKey = property(record, "partitionKey");
  const rowKey = property(record, "rowKey");
  const observedVisitorId = property(record, "visitorId");
  const observedEventId = property(record, "id");
  const observedOccurredAt = property(record, "occurredAt");
  if (
    !validIdentifier(partitionKey)
    || !validIdentifier(rowKey)
    || !validIdentifier(observedVisitorId)
    || !validIdentifier(observedEventId)
    || !validOccurrenceTimestamp(observedOccurredAt)
    || !validTableKey(partitionKey)
    || !validTableKey(rowKey)
  ) {
    return ambiguous("record_malformed", candidateRowKey);
  }

  if (partitionKey !== visitorId) return ambiguous("partition_key_mismatch", candidateRowKey);
  if (rowKey !== candidateRowKey) return ambiguous("row_key_mismatch", candidateRowKey);
  if (observedVisitorId !== visitorId) return ambiguous("visitor_id_mismatch", candidateRowKey);
  if (observedEventId !== eventId) return ambiguous("event_id_mismatch", candidateRowKey);
  if (observedOccurredAt !== occurredAt) return ambiguous("occurred_at_mismatch", candidateRowKey);

  return {
    status: "matching_evidence",
    reasonCode: "record_matches_trusted_identity",
    candidateRowKey
  };
}

export function assessFormationEventAcquisition(
  input: FormationEventEvidenceAcquisitionInputV1
): FormationEventEvidenceAcquisitionResultV1 {
  try {
    const assessment = assess(input);
    return result(assessment.status, assessment.reasonCode, assessment.candidateRowKey);
  } catch {
    return result("ambiguous", "adversarial_input", null);
  }
}
