/**
 * Bulk Care request membership identity contract.
 *
 * This is an immutable in-memory representation of caller-supplied intent.
 * It is not proof of a persisted request, completed assignment, full
 * history, verified writer participation, or staff authorization.
 *
 * No production writer integration, storage I/O, retries, or recovery.
 */

export type CareBulkMembershipKind = "assign" | "unassign";

export type CareBulkMembershipIntent = Readonly<{
  requestId: string;
  kind: CareBulkMembershipKind;
  assigneeId: string | null;
  visitorIds: readonly string[];
}>;

export type CareBulkMembershipParseResult =
  | Readonly<{
      status: "valid_unpersisted_intent";
      intent: CareBulkMembershipIntent;
      durable: false;
      authorizationPermitted: false;
      executionPermitted: false;
      retryPermitted: false;
      automaticRecoveryPermitted: false;
      productionRolloutPermitted: false;
    }>
  | Readonly<{
      status: "invalid_input";
      intent: null;
      durable: false;
      authorizationPermitted: false;
      executionPermitted: false;
      retryPermitted: false;
      automaticRecoveryPermitted: false;
      productionRolloutPermitted: false;
    }>;

export type CareBulkMembershipComparison = Readonly<{
  status: "same_intent_not_durable" | "conflict" | "invalid_input";
  durableReplayVerified: false;
  authorizationPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  automaticRecoveryPermitted: false;
  productionRolloutPermitted: false;
}>;

const safety = {
  authorizationPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  productionRolloutPermitted: false
} as const;

function ownData(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("Missing own data property");
  }
  return descriptor.value;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length &&
    keys.every(key => typeof key === "string" && expected.includes(key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Strictly parses untrusted request intent without relying on getters,
 * inherited fields, or a caller-controlled serialization function.
 */
export function parseCareBulkMembershipIntent(
  value: unknown
): CareBulkMembershipParseResult {
  const invalid: CareBulkMembershipParseResult = {
    status: "invalid_input",
    intent: null,
    durable: false,
    ...safety
  };

  try {
    if (!value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !exactKeys(value, [
          "requestId",
          "kind",
          "assigneeId",
          "visitorIds"
        ])) {
      return invalid;
    }

    const requestId = ownData(value, "requestId");
    const kind = ownData(value, "kind");
    const assigneeId = ownData(value, "assigneeId");
    const visitorIds = ownData(value, "visitorIds");

    if (!validId(requestId) ||
        (kind !== "assign" && kind !== "unassign") ||
        !Array.isArray(visitorIds) ||
        visitorIds.length < 1 ||
        visitorIds.length > 1000) {
      return invalid;
    }

    if (kind === "assign" && !validId(assigneeId)) {
      return invalid;
    }

    if (kind === "unassign" && assigneeId !== null) {
      return invalid;
    }

    const members: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < visitorIds.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(visitorIds, i)) {
        return invalid;
      }

      const visitorId = ownData(visitorIds, String(i));

      if (!validId(visitorId) || seen.has(visitorId)) {
        return invalid;
      }

      seen.add(visitorId);
      members.push(visitorId);
    }

    const intent: CareBulkMembershipIntent = Object.freeze({
      requestId,
      kind,
      assigneeId: kind === "assign" ? assigneeId as string : null,
      visitorIds: Object.freeze(members)
    });

    return {
      status: "valid_unpersisted_intent",
      intent,
      durable: false,
      ...safety
    };
  } catch {
    // Hostile proxies, accessors, and revoked proxies fail closed.
    return invalid;
  }
}

/**
 * Compare two independently parsed intent envelopes.
 *
 * Matching content is NOT proof that either intent was committed.
 * A matching request ID with different membership or semantics is a
 * conflict. No result here permits replay or a new writer execution.
 */
export function compareCareBulkMembershipIntent(
  original: unknown,
  candidate: unknown
): CareBulkMembershipComparison {
  const invalid: CareBulkMembershipComparison = {
    status: "invalid_input",
    durableReplayVerified: false,
    ...safety
  };

  const first = parseCareBulkMembershipIntent(original);
  const second = parseCareBulkMembershipIntent(candidate);

  if (!first.intent || !second.intent) {
    return invalid;
  }

  const a = first.intent;
  const b = second.intent;

  const same =
    a.requestId === b.requestId &&
    a.kind === b.kind &&
    a.assigneeId === b.assigneeId &&
    a.visitorIds.length === b.visitorIds.length &&
    a.visitorIds.every((id, index) => id === b.visitorIds[index]);

  return {
    status: same ? "same_intent_not_durable" : "conflict",
    durableReplayVerified: false,
    ...safety
  };
}
