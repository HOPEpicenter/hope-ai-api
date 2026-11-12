import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEntraStaffAcceptanceHandoff,
  ENTRA_STAFF_ACCEPTANCE_OPERATION,
  type TrustedEntraStaffAcceptanceEvidence
} from "../../src/services/authorization/entraStaffAcceptanceHandoff";

const staffId = randomUUID();
const tenantId = randomUUID();
const objectId = randomUUID();
let currentTime = 2_000_000_000_000;

function evidence(
  overrides: Partial<TrustedEntraStaffAcceptanceEvidence> = {}
): TrustedEntraStaffAcceptanceEvidence {
  const identity = {
    staffId,
    tenantId,
    objectId
  };
  return {
    verifiedIdentity: identity,
    canonicalStaff: {
      staffId,
      status: "active",
      entraTenantId: tenantId,
      entraObjectId: objectId
    },
    administratorAuthorized: true,
    verifiedAt: currentTime,
    ...overrides
  };
}

function boundary(
  resolve: () => TrustedEntraStaffAcceptanceEvidence | null =
    () => evidence()
) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    resolveAuthorizedEvidence: async () => {
      calls += 1;
      return resolve();
    }
  };
}

async function run(): Promise<void> {
  const defaultBoundary = boundary();
  const disabled = createEntraStaffAcceptanceHandoff(
    {},
    defaultBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await disabled.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "disabled" }
  );
  assert.equal(defaultBoundary.calls, 0);

  const trustedBoundary = boundary();
  const handoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    trustedBoundary,
    () => currentTime
  );
  const issued = await handoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(issued.status, "issued");
  if (issued.status !== "issued") {
    throw new Error("Handoff was not issued");
  }
  assert.deepEqual(Reflect.ownKeys(issued.receipt), []);
  const simultaneousConsumption = await Promise.all([
    handoff.consume(issued.receipt, ENTRA_STAFF_ACCEPTANCE_OPERATION),
    handoff.consume(issued.receipt, ENTRA_STAFF_ACCEPTANCE_OPERATION)
  ]);
  assert.deepEqual(
    simultaneousConsumption.map(result => result.status).sort(),
    ["authorized", "invalid_receipt"]
  );
  assert.equal(trustedBoundary.calls, 2);

  const wrongOperationBoundary = boundary();
  const wrongOperationHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    wrongOperationBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await wrongOperationHandoff.issue("another-operation"),
    { status: "operation_mismatch" }
  );
  assert.equal(wrongOperationBoundary.calls, 0);

  const mismatchedOperationReceipt =
    await wrongOperationHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(mismatchedOperationReceipt.status, "issued");
  if (mismatchedOperationReceipt.status !== "issued") {
    throw new Error("Handoff was not issued");
  }
  assert.deepEqual(
    await wrongOperationHandoff.consume(
      mismatchedOperationReceipt.receipt,
      "another-operation"
    ),
    { status: "operation_mismatch" }
  );
  assert.deepEqual(
    await wrongOperationHandoff.consume(
      mismatchedOperationReceipt.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "invalid_receipt" }
  );

  const expiredBoundary = boundary();
  const expiredHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    expiredBoundary,
    () => currentTime
  );
  const expiring = await expiredHandoff.issue(
    ENTRA_STAFF_ACCEPTANCE_OPERATION
  );
  assert.equal(expiring.status, "issued");
  if (expiring.status !== "issued") {
    throw new Error("Handoff was not issued");
  }
  currentTime += 5 * 60 * 1000 + 1;
  assert.deepEqual(
    await expiredHandoff.consume(
      expiring.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "expired" }
  );
  currentTime -= 5 * 60 * 1000 + 1;

  const staleEvidenceBoundary = boundary(() =>
    evidence({ verifiedAt: currentTime - 5 * 60 * 1000 - 1 })
  );
  const staleEvidenceHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    staleEvidenceBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await staleEvidenceHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "expired" }
  );

  let resolveCount = 0;
  const changedTenantId = randomUUID();
  const changedIdentityBoundary = boundary(() => {
    resolveCount += 1;
    return resolveCount === 1
      ? evidence()
      : evidence({
          verifiedIdentity: {
            staffId,
            tenantId: changedTenantId,
            objectId
          },
          canonicalStaff: {
            staffId,
            status: "active",
            entraTenantId: changedTenantId,
            entraObjectId: objectId
          }
        });
  });
  const changedIdentityHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    changedIdentityBoundary,
    () => currentTime
  );
  const identityBound = await changedIdentityHandoff.issue(
    ENTRA_STAFF_ACCEPTANCE_OPERATION
  );
  assert.equal(identityBound.status, "issued");
  if (identityBound.status !== "issued") {
    throw new Error("Handoff was not issued");
  }
  assert.deepEqual(
    await changedIdentityHandoff.consume(
      identityBound.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "denied" }
  );

  const inactiveBoundary = boundary(() =>
    evidence({
      canonicalStaff: {
        staffId,
        status: "inactive",
        entraTenantId: tenantId,
        entraObjectId: objectId
      }
    })
  );
  const inactiveHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    inactiveBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await inactiveHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );

  const unauthorizedBoundary = boundary(() =>
    evidence({ administratorAuthorized: false })
  );
  const unauthorizedHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    unauthorizedBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await unauthorizedHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );

  const mismatchedBindingBoundary = boundary(() =>
    evidence({
      canonicalStaff: {
        staffId,
        status: "active",
        entraTenantId: randomUUID(),
        entraObjectId: objectId
      }
    })
  );
  const mismatchedBindingHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    mismatchedBindingBoundary,
    () => currentTime
  );
  assert.deepEqual(
    await mismatchedBindingHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );

  const unavailableHandoff = createEntraStaffAcceptanceHandoff(
    { enabled: true },
    {
      resolveAuthorizedEvidence: async () => {
        throw new Error("sensitive boundary details must not escape");
      }
    },
    () => currentTime
  );
  assert.deepEqual(
    await unavailableHandoff.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "boundary_unavailable" }
  );

  assert.deepEqual(
    await handoff.consume(
      Object.freeze(Object.create(null)) as object,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "invalid_receipt" }
  );

  console.log("ENTRA_STAFF_ACCEPTANCE_HANDOFF_TESTS_PASSED=True");
}

void run();
