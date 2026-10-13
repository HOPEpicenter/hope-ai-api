import assert from "node:assert/strict";
import {
  STAFF_SECURITY_HEAD_ROW,
  STAFF_SECURITY_PROTOTYPE_PARTITION
} from "../../src/repositories/oauthStaffSecurityStorageRepository";

type RowLocation = Readonly<{
  table: string;
  partitionKey: string;
  rowKey: string;
}>;

type EvidenceState =
  | "durable"
  | "missing"
  | "rejected"
  | "uncertain"
  | "unavailable"
  | "caller_asserted";

type Evidence = Readonly<{
  state: EvidenceState;
  sourceId?: string;
  recordId?: string;
  operationId?: string;
}>;

type Observation = Readonly<{
  intent: Evidence;
  security: Evidence;
  staffEvent: Evidence;
  projection: Evidence;
  binding:
    | "current"
    | "missing"
    | "released"
    | "reassigned"
    | "not_applicable";
  invitation:
    | "not_applicable"
    | "not_started"
    | "external_success_only"
    | "durable_local_success"
    | "uncertain"
    | "unavailable";
  invitationOutcome?: Evidence;
  duplicate: boolean;
  contradiction: boolean;
}>;

type Review = Readonly<{
  status:
    | "not_started"
    | "incomplete"
    | "pending"
    | "rejected"
    | "uncertain"
    | "unavailable"
    | "contradictory"
    | "stale_historical"
    | "internally_consistent";
  nextAction: "inspect_or_manual_review" | "none";
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  storageProtocolReady: false;
}>;

const sourceNames = {
  security: "security-operation-store",
  staffEvent: "StaffEvents",
  projection: "staff-projection-reader",
  invitation: "local-invitation-outcome-store"
} as const;

const NEVER_AUTHORIZE = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  storageProtocolReady: false
} as const;

function canShareAzureTableTransaction(
  left: RowLocation,
  right: RowLocation
): boolean {
  return left.table === right.table &&
    left.partitionKey === right.partitionKey;
}

function inspect(observation: Observation): Review {
  const result = (
    status: Review["status"],
    nextAction: Review["nextAction"] = "inspect_or_manual_review"
  ): Review => ({ status, nextAction, ...NEVER_AUTHORIZE });
  const durableFrom = (
    item: Evidence,
    sourceId: string
  ): boolean =>
    item.state === "durable" &&
    item.sourceId === sourceId &&
    typeof item.recordId === "string" &&
    item.recordId.length > 0;
  const operationIdentityConflict = [
    observation.intent,
    observation.security,
    observation.staffEvent,
    observation.projection,
    observation.invitationOutcome
  ].some(item =>
    item?.state === "durable" &&
    item.operationId !== undefined &&
    item.operationId !== operationId
  );

  if (
    observation.intent.state === "unavailable" ||
    observation.security.state === "unavailable" ||
    observation.staffEvent.state === "unavailable" ||
    observation.projection.state === "unavailable" ||
    observation.invitation === "unavailable"
  ) {
    return result("unavailable");
  }
  if (
    observation.intent.state === "uncertain" ||
    observation.security.state === "uncertain" ||
    observation.staffEvent.state === "uncertain" ||
    observation.projection.state === "uncertain" ||
    observation.invitation === "uncertain"
  ) {
    return result("uncertain");
  }
  if (operationIdentityConflict) {
    return result("contradictory");
  }
  if (
    observation.security.state === "rejected" &&
    (observation.staffEvent.state === "durable" ||
      observation.projection.state === "durable")
  ) {
    return result("contradictory");
  }
  if (observation.contradiction || observation.duplicate) {
    return result("contradictory");
  }
  if (
    observation.binding === "released" ||
    observation.binding === "reassigned"
  ) {
    return result("stale_historical");
  }
  if (
    observation.security.state === "rejected" ||
    observation.intent.state === "rejected"
  ) {
    return result("rejected");
  }
  if (
    observation.invitation === "external_success_only" ||
    observation.intent.state === "caller_asserted" ||
    observation.security.state === "caller_asserted" ||
    observation.staffEvent.state === "caller_asserted" ||
    observation.projection.state === "caller_asserted"
  ) {
    return result("incomplete");
  }
  if (
    observation.intent.state === "missing" &&
    observation.security.state === "missing" &&
    observation.staffEvent.state === "missing" &&
    observation.projection.state === "missing"
  ) {
    return result("not_started");
  }
  if (
    observation.intent.state === "durable" &&
      (!durableFrom(observation.intent, "security-operation-store") ||
        observation.intent.operationId !== operationId) ||
    observation.security.state === "durable" &&
      (!durableFrom(observation.security, sourceNames.security) ||
        observation.security.operationId !== operationId) ||
    observation.staffEvent.state === "durable" &&
      (!durableFrom(observation.staffEvent, sourceNames.staffEvent) ||
        observation.staffEvent.operationId !== operationId) ||
    observation.projection.state === "durable" &&
      (!durableFrom(observation.projection, sourceNames.projection) ||
        observation.projection.operationId !== operationId)
  ) {
    return result("incomplete");
  }
  if (
    observation.security.state !== "durable" ||
    observation.staffEvent.state !== "durable" ||
    observation.intent.state !== "durable"
  ) {
    return result("incomplete");
  }
  if (observation.projection.state !== "durable") {
    return result("pending");
  }
  if (
    observation.binding !== "current" &&
    observation.binding !== "not_applicable"
  ) {
    return result("incomplete");
  }
  if (
    observation.invitation !== "not_applicable" &&
    observation.invitation !== "durable_local_success"
  ) {
    return result("incomplete");
  }
  if (
    observation.invitation === "durable_local_success" &&
    (!observation.invitationOutcome ||
      !durableFrom(
        observation.invitationOutcome,
        sourceNames.invitation
      ) ||
      observation.invitationOutcome.operationId !== operationId)
  ) {
    return result("incomplete");
  }
  return result("internally_consistent", "none");
}

function evidence(state: EvidenceState, sourceId?: string): Evidence {
  return {
    state,
    ...(sourceId ? { sourceId } : {}),
    ...(state === "durable"
      ? {
          recordId: `row-${sourceId}`,
          operationId
        }
      : {})
  };
}

function completeObservation(): Observation {
  return {
    intent: evidence("durable", "security-operation-store"),
    security: evidence("durable", sourceNames.security),
    staffEvent: evidence("durable", sourceNames.staffEvent),
    projection: evidence("durable", sourceNames.projection),
    binding: "current",
    invitation: "not_applicable",
    duplicate: false,
    contradiction: false
  };
}

function assertNonAuthorizing(review: Review): void {
  assert.equal(review.authoritative, false);
  assert.equal(review.executionPermitted, false);
  assert.equal(review.retryPermitted, false);
  assert.equal(review.storageProtocolReady, false);
}

// Existing security records: all use the injected security table and one
// fixed partition; row keys distinguish the head, owner, and receipt.
const securityTable = "injected-security-table";
const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const authorityHead: RowLocation = {
  table: securityTable,
  partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
  rowKey: STAFF_SECURITY_HEAD_ROW
};
const bindingRow: RowLocation = {
  table: securityTable,
  partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
  rowKey: `binding-${tenantId}-${objectId}`
};
const operationReceipt: RowLocation = {
  table: securityTable,
  partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
  rowKey: `operation-${operationId}`
};

assert.equal(STAFF_SECURITY_PROTOTYPE_PARTITION, "staff-security-prototype-v1");
assert.equal(STAFF_SECURITY_HEAD_ROW, "ordering-head");
assert.equal(canShareAzureTableTransaction(authorityHead, bindingRow), true);
assert.equal(canShareAzureTableTransaction(authorityHead, operationReceipt), true);
assert.equal(canShareAzureTableTransaction(bindingRow, operationReceipt), true);

const staffEventRow: RowLocation = {
  table: "StaffEvents",
  partitionKey: "canonical-staff-id",
  rowKey: "occurred-at__event-id"
};
assert.equal(
  canShareAzureTableTransaction(operationReceipt, staffEventRow),
  false,
  "different table and partition cannot join the security transaction"
);
assert.equal(
  canShareAzureTableTransaction(
    { table: "one-table", partitionKey: "staff-a", rowKey: "operation" },
    { table: "one-table", partitionKey: "staff-b", rowKey: "event" }
  ),
  false,
  "same table with different partition keys cannot share a batch"
);
assert.equal(
  canShareAzureTableTransaction(
    { table: "table-a", partitionKey: "p", rowKey: "one" },
    { table: "table-b", partitionKey: "p", rowKey: "two" }
  ),
  false,
  "same partition string in different tables is not atomic"
);

const cases: ReadonlyArray<{
  name: string;
  observation: Observation;
  expected: Review["status"];
}> = [
  {
    name: "all locally persisted facts present",
    observation: completeObservation(),
    expected: "internally_consistent"
  },
  {
    name: "not started",
    observation: {
      ...completeObservation(),
      intent: evidence("missing"),
      security: evidence("missing"),
      staffEvent: evidence("missing"),
      projection: evidence("missing"),
      binding: "not_applicable"
    },
    expected: "not_started"
  },
  {
    name: "security committed but StaffEvents append absent",
    observation: {
      ...completeObservation(),
      staffEvent: evidence("missing")
    },
    expected: "incomplete"
  },
  {
    name: "StaffEvents present without security receipt",
    observation: {
      ...completeObservation(),
      security: evidence("missing")
    },
    expected: "incomplete"
  },
  {
    name: "projection application not proven",
    observation: {
      ...completeObservation(),
      projection: evidence("missing")
    },
    expected: "pending"
  },
  {
    name: "security rejected",
    observation: {
      ...completeObservation(),
      security: evidence("rejected"),
      staffEvent: evidence("missing"),
      projection: evidence("missing")
    },
    expected: "rejected"
  },
  {
    name: "rejected security cannot coexist with a committed event",
    observation: {
      ...completeObservation(),
      security: evidence("rejected")
    },
    expected: "contradictory"
  },
  {
    name: "unknown write acknowledgement",
    observation: {
      ...completeObservation(),
      staffEvent: evidence("uncertain")
    },
    expected: "uncertain"
  },
  {
    name: "duplicate operation replay",
    observation: { ...completeObservation(), duplicate: true },
    expected: "contradictory"
  },
  {
    name: "duplicate event write",
    observation: { ...completeObservation(), duplicate: true },
    expected: "contradictory"
  },
  {
    name: "historical records without durable operation correlation",
    observation: {
      ...completeObservation(),
      staffEvent: {
        state: "durable",
        sourceId: sourceNames.staffEvent,
        recordId: "legacy-event-row"
      }
    },
    expected: "incomplete"
  },
  {
    name: "mismatched operation identity",
    observation: {
      ...completeObservation(),
      security: {
        ...evidence("durable", sourceNames.security),
        operationId: "different-operation"
      }
    },
    expected: "contradictory"
  },
  {
    name: "current binding released",
    observation: { ...completeObservation(), binding: "released" },
    expected: "stale_historical"
  },
  {
    name: "current binding reassigned",
    observation: { ...completeObservation(), binding: "reassigned" },
    expected: "stale_historical"
  },
  {
    name: "current binding ownership missing",
    observation: { ...completeObservation(), binding: "missing" },
    expected: "incomplete"
  },
  {
    name: "Graph success without durable local outcome",
    observation: {
      ...completeObservation(),
      invitation: "external_success_only"
    },
    expected: "incomplete"
  },
  {
    name: "Graph success cannot replace missing security or event records",
    observation: {
      ...completeObservation(),
      security: evidence("missing"),
      staffEvent: evidence("missing"),
      invitation: "external_success_only"
    },
    expected: "incomplete"
  },
  {
    name: "external invitation success is not classified as not started",
    observation: {
      ...completeObservation(),
      intent: evidence("missing"),
      security: evidence("missing"),
      staffEvent: evidence("missing"),
      projection: evidence("missing"),
      binding: "missing",
      invitation: "external_success_only"
    },
    expected: "incomplete"
  },
  {
    name: "durable local invitation outcome can be internally consistent",
    observation: {
      ...completeObservation(),
      invitation: "durable_local_success",
      invitationOutcome: evidence(
        "durable",
        sourceNames.invitation
      )
    },
    expected: "internally_consistent"
  },
  {
    name: "caller-supplied local invitation outcome is not source evidence",
    observation: {
      ...completeObservation(),
      invitation: "durable_local_success",
      invitationOutcome: evidence("caller_asserted")
    },
    expected: "incomplete"
  },
  {
    name: "durable-looking record from wrong source is not verified",
    observation: {
      ...completeObservation(),
      staffEvent: evidence("durable", "security-operation-store")
    },
    expected: "incomplete"
  },
  {
    name: "invitation acknowledgement uncertain",
    observation: {
      ...completeObservation(),
      invitation: "uncertain"
    },
    expected: "uncertain"
  },
  {
    name: "source unavailable",
    observation: {
      ...completeObservation(),
      security: evidence("unavailable")
    },
    expected: "unavailable"
  },
  {
    name: "contradictory source evidence",
    observation: { ...completeObservation(), contradiction: true },
    expected: "contradictory"
  },
  {
    name: "caller assertion cannot substitute for source read",
    observation: {
      ...completeObservation(),
      security: evidence("caller_asserted")
    },
    expected: "incomplete"
  }
];

for (const testCase of cases) {
  const review = inspect(testCase.observation);
  assert.equal(review.status, testCase.expected, testCase.name);
  assert.equal(
    review.nextAction === "inspect_or_manual_review" ||
      review.nextAction === "none",
    true,
    `${testCase.name} never enables an automated write or retry`
  );
  assertNonAuthorizing(review);
}

console.log("Staff operation correlation persistence design tests passed");
