import { createHash } from "node:crypto";
import {
  assessSyntheticInspectionAuthority
} from "./assess-synthetic-inspection-authority.mjs";

// In-memory protocol exercise only; no external transaction port exists.
const fixtures = new WeakMap();

function operationKey(operationId) {
  return createHash("sha256")
    .update(`kiosk.synthetic-intake.inspect-one.v1:${operationId}`)
    .digest("hex");
}

function denied(status, fixtureConsumed = false) {
  return Object.freeze({
    status,
    fixtureConsumed,
    operatorVerified: false,
    issuerAuthorized: false,
    uuidEvidenceVerified: false,
    replayProtectionVerified: false,
    durableConsumptionVerified: false,
    inspectionAuthorized: false,
    executionPermitted: false,
    cleanupAuthorized: false
  });
}

export function createSyntheticInspectionConsumptionFixture(context, operator) {
  const fixture = Object.freeze({});
  fixtures.set(fixture, {
    context: structuredClone(context),
    operator: structuredClone(operator),
    transactions: new Map()
  });
  return fixture;
}

export function simulateSyntheticInspectionConsumption(request, fixture) {
  const state = fixtures.get(fixture);
  if (!state) return denied("FIXTURE_REQUIRED");

  let item;
  try {
    item = structuredClone(request);
  } catch {
    return denied("INVALID_FIXTURE_REQUEST");
  }
  const assessment = assessSyntheticInspectionAuthority(item, state.context);
  if (assessment.status !== "EXECUTION_DISABLED_TRUST_AND_REPLAY_UNAVAILABLE" ||
      assessment.signatureMatchesSuppliedKey !== true) {
    return denied("APPROVAL_REJECTED");
  }
  if (!state.operator ||
      state.operator.tenantId !== item.operator.tenantId ||
      state.operator.objectId !== item.operator.objectId) {
    return denied("FIXTURE_OPERATOR_MISMATCH");
  }

  const key = operationKey(item.operationId);
  if (state.transactions.has(key)) return denied("FIXTURE_REPLAY");

  const approvalDigest = createHash("sha256")
    .update(item.envelope.payload, "utf8")
    .digest("hex");
  state.transactions.set(key, Object.freeze({
    claim: Object.freeze({ operationKey: key, approvalDigest }),
    audit: Object.freeze({ operationKey: key, approvalDigest })
  }));
  return denied("FIXTURE_CONSUMPTION_ONLY", true);
}

export function inspectSyntheticConsumptionFixture(operationId, fixture) {
  const state = fixtures.get(fixture);
  if (!state) return denied("FIXTURE_REQUIRED");
  if (typeof operationId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}(?![\s\S])/.test(operationId)) {
    return denied("INVALID_OPERATION_ID");
  }
  const key = operationKey(operationId);
  const transaction = state.transactions.get(key);
  if (!transaction ||
      transaction.claim.operationKey !== key ||
      transaction.audit.operationKey !== key ||
      transaction.claim.approvalDigest !== transaction.audit.approvalDigest) {
    return denied("FIXTURE_AUDIT_UNAVAILABLE");
  }
  return denied("FIXTURE_AUDIT_MATCHED");
}
