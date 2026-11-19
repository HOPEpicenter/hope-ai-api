import { createHash } from "node:crypto";

// Fixture-only: no Azure client, credentials, command-line execution, or live deletion.
const SCOPE = Object.freeze({
  subscription: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
  resourceGroup: "rg-hope-kiosk-acceptance-20261122",
  account: "sthopekiad20261122",
  table: "KioskIntakeSubmissions",
  partition: "friends-family-2026-11-22"
});
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SYNTHETIC = Object.freeze({
  name: "Synthetic Kiosk Cleanup Test",
  email: "kiosk-cleanup@example.invalid",
  phone: "",
  visitType: "first",
  interests: Object.freeze(["prayer"]),
  invitedBy: "",
  contactConsent: false
});
const HASH = createHash("sha256").update(JSON.stringify([
  SYNTHETIC.name,
  SYNTHETIC.email.toLowerCase(),
  SYNTHETIC.phone,
  SYNTHETIC.visitType,
  [...SYNTHETIC.interests].sort(),
  SYNTHETIC.invitedBy,
  SYNTHETIC.contactConsent
])).digest("hex");
const ALLOWED_FIELDS = new Set([
  "partitionKey", "rowKey", "payloadHash", "name", "email", "phone",
  "visitType", "interestsJson", "invitedBy", "contactConsent", "receivedAt",
  "source", "reviewStatus", "etag", "timestamp"
]);
const stores = new WeakSet();
const captures = new WeakMap();
const approvals = new WeakMap();

function result(status) {
  return Object.freeze({ status, liveExecutionPermitted: false });
}

function validScope(target) {
  return target && typeof target === "object" && !Array.isArray(target) &&
    Object.keys(target).length === Object.keys(SCOPE).length + 1 &&
    Object.keys(SCOPE).every(key =>
      Object.hasOwn(target, key) && target[key] === SCOPE[key]
    ) &&
    Object.hasOwn(target, "submissionId") &&
    typeof target.submissionId === "string" &&
    UUID4.test(target.submissionId);
}

function validEtag(etag) {
  return typeof etag === "string" && etag.length > 0 &&
    etag.length <= 1024 &&
    /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"(?![\s\S])/.test(etag);
}

function matchesRow(row, submissionId) {
  return row && typeof row === "object" && !Array.isArray(row) &&
    Object.keys(row).every(key => ALLOWED_FIELDS.has(key)) &&
    row.partitionKey === SCOPE.partition &&
    row.rowKey === submissionId &&
    row.source === "hope_ipad_kiosk_v1" &&
    row.reviewStatus === "pending" &&
    row.name === SYNTHETIC.name &&
    row.email === SYNTHETIC.email &&
    row.phone === SYNTHETIC.phone &&
    row.visitType === SYNTHETIC.visitType &&
    row.interestsJson === JSON.stringify(SYNTHETIC.interests) &&
    row.invitedBy === SYNTHETIC.invitedBy &&
    row.contactConsent === SYNTHETIC.contactConsent &&
    row.payloadHash === HASH &&
    typeof row.receivedAt === "string" &&
    Number.isFinite(Date.parse(row.receivedAt)) &&
    validEtag(row.etag);
}

/**
 * Simulates one exact-row read and, only with fixture approval, a conditional
 * delete. Captures and approvals here are test-only, not real authorization.
 * A live implementation requires separately verified, operation-specific
 * approval and trusted proof binding the captured UUID to this payload.
 */
export async function simulateSyntheticIntakeCleanup(
  target,
  { store, capture, approval, mode = "disabled" } = {}
) {
  if (mode === "disabled") return result("DISABLED");
  if (mode !== "inspect" && mode !== "simulate-delete") {
    return result("INVALID_MODE");
  }
  if (!validScope(target)) return result("INVALID_TARGET");
  if (!stores.has(store)) return result("FIXTURE_REQUIRED");

  const evidence = captures.get(capture);
  if (!evidence || evidence.store !== store ||
      evidence.submissionId !== target.submissionId ||
      evidence.payloadHash !== HASH) {
    return result("SYNTHETIC_PROOF_REQUIRED");
  }

  let authorization;
  if (mode === "simulate-delete") {
    authorization = approvals.get(approval);
    if (!authorization || authorization.used ||
        authorization.store !== store ||
        authorization.capture !== capture ||
        authorization.submissionId !== target.submissionId) {
      return result("APPROVAL_REQUIRED");
    }
    authorization.used = true;
  }

  let row;
  try {
    row = await store.getEntity(SCOPE.partition, target.submissionId);
  } catch (error) {
    return result(error?.statusCode === 404 ? "ROW_NOT_FOUND" : "READ_FAILED");
  }

  if (!matchesRow(row, target.submissionId)) return result("ROW_REJECTED");
  if (mode === "inspect") return result("MATCHED_READ_ONLY");
  if (row.etag !== authorization.etag) return result("ETAG_CHANGED");

  try {
    await store.deleteEntity(SCOPE.partition, target.submissionId, {
      etag: authorization.etag
    });
    return result("SIMULATED_DELETION");
  } catch (error) {
    if (error?.statusCode === 409 || error?.statusCode === 412 ||
        error?.statusCode === 404) {
      return result("CONCURRENT_CHANGE");
    }
    return result("SIMULATED_OUTCOME_UNKNOWN");
  }
}

// Fixture-only inspection; no caller-provided value grants live authority.
export async function inspectSyntheticIntakeFixture(
  target,
  { store, capture, enabled = false } = {}
) {
  if (enabled !== true) return Object.freeze({ status: "DISABLED" });
  const inspection = await simulateSyntheticIntakeCleanup(target, {
    store, capture, mode: "inspect"
  });
  return Object.freeze({ status: inspection.status });
}

/**
 * Creates a branded, in-memory-only SDK-shaped fixture. It cannot wrap an
 * external client. The fixture approval is not usable outside this simulation.
 */
export function createSyntheticCleanupFixture(initialRow) {
  let row = initialRow ? structuredClone(initialRow) : null;
  let beforeDelete;
  let nextReadError;
  let reads = 0;
  let deletions = 0;
  const store = Object.freeze({
    async getEntity(partition, id) {
      reads++;
      if (nextReadError !== undefined) {
        const statusCode = nextReadError;
        nextReadError = undefined;
        throw { statusCode };
      }
      if (!row || row.partitionKey !== partition || row.rowKey !== id) {
        throw { statusCode: 404 };
      }
      return structuredClone(row);
    },
    async deleteEntity(partition, id, options) {
      if (beforeDelete) {
        row = beforeDelete(structuredClone(row));
        beforeDelete = undefined;
      }
      if (!row || row.partitionKey !== partition || row.rowKey !== id ||
          row.etag !== options?.etag) {
        throw { statusCode: 412 };
      }
      row = null;
      deletions++;
    }
  });
  stores.add(store);

  return Object.freeze({
    store,
    captureSyntheticSubmission(submissionId) {
      const capture = Object.freeze({});
      captures.set(capture, { store, submissionId, payloadHash: HASH });
      return capture;
    },
    approveSimulation(target, capture, etag) {
      const evidence = captures.get(capture);
      if (!validScope(target) || !validEtag(etag) ||
          !evidence || evidence.store !== store ||
          evidence.submissionId !== target.submissionId) {
        return null;
      }
      const approval = Object.freeze({});
      approvals.set(approval, {
        store, capture, submissionId: target.submissionId, etag, used: false
      });
      return approval;
    },
    replaceRow(nextRow) { row = nextRow ? structuredClone(nextRow) : null; },
    failNextRead(statusCode) { nextReadError = statusCode; },
    changeBeforeDelete(change) { beforeDelete = change; },
    counts() { return { reads, deletions }; }
  });
}
