import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createEntraStaffAcceptanceHandoff,
  ENTRA_STAFF_ACCEPTANCE_OPERATION,
  type TrustedEntraStaffAcceptanceEvidence
} from "../../src/services/authorization/entraStaffAcceptanceHandoff";
import type {
  EntraStaffAcceptanceReceiptConsumption,
  EntraStaffAcceptanceReceiptRecord,
  EntraStaffAcceptanceReceiptRepository,
  EntraStaffAcceptanceReceiptStorageStatus
} from "../../src/repositories/entraStaffAcceptanceHandoffReceiptStorageRepository";

const staffId = randomUUID();
const tenantId = randomUUID();
const objectId = randomUUID();
let currentTime = 2_000_000_000_000;

function evidence(
  overrides: Partial<TrustedEntraStaffAcceptanceEvidence> = {}
): TrustedEntraStaffAcceptanceEvidence {
  return {
    verifiedIdentity: { staffId, tenantId, objectId },
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

type StoredReceipt = {
  record: EntraStaffAcceptanceReceiptRecord;
  state: "issued" | "consumed";
  revision: number;
};

class MemoryReceiptRepository
implements EntraStaffAcceptanceReceiptRepository {
  readonly records = new Map<string, StoredReceipt>();
  issueOutcome: EntraStaffAcceptanceReceiptStorageStatus = "issued";
  consumeOutcome: EntraStaffAcceptanceReceiptStorageStatus = "consumed";
  issueCalls = 0;
  consumeCalls = 0;

  async issueIfAbsent(
    record: EntraStaffAcceptanceReceiptRecord
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus> {
    this.issueCalls += 1;
    if (this.issueOutcome !== "issued") {
      return this.issueOutcome;
    }
    if (this.records.has(record.receiptId)) {
      return "denied";
    }
    this.records.set(record.receiptId, {
      record,
      state: "issued",
      revision: 0
    });
    return "issued";
  }

  async consumeIfAvailable(
    request: EntraStaffAcceptanceReceiptConsumption
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus> {
    this.consumeCalls += 1;
    if (this.consumeOutcome !== "consumed") {
      return this.consumeOutcome;
    }
    const stored = this.records.get(request.receiptId);
    if (
      !stored ||
      stored.record.operation !== request.operation ||
      stored.record.identityDigest !== request.identityDigest ||
      stored.state !== "issued" ||
      stored.revision !== 0 ||
      stored.record.issuedAtMs > currentTime ||
      currentTime >= stored.record.expiresAtMs
    ) {
      return "denied";
    }

    stored.state = "consumed";
    stored.revision = 1;
    return "consumed";
  }
}

function createHandoff(
  repository: EntraStaffAcceptanceReceiptRepository,
  authorizedBoundary: ReturnType<typeof boundary> = boundary()
) {
  return createEntraStaffAcceptanceHandoff(
    { enabled: true },
    {
      boundary: authorizedBoundary,
      repository,
      now: () => currentTime,
      createReceiptId: () => randomBytes(32).toString("hex")
    }
  );
}

async function run(): Promise<void> {
  const unusedRepository = new MemoryReceiptRepository();
  const disabledBoundary = boundary();
  const disabled = createEntraStaffAcceptanceHandoff(
    {},
    {
      boundary: disabledBoundary,
      repository: unusedRepository,
      now: () => currentTime
    }
  );
  assert.deepEqual(
    await disabled.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "disabled" }
  );
  assert.deepEqual(
    await disabled.consume(
      { receiptId: randomBytes(32).toString("hex") },
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "disabled" }
  );
  assert.equal(disabledBoundary.calls, 0);
  assert.equal(unusedRepository.issueCalls, 0);
  assert.equal(unusedRepository.consumeCalls, 0);

  const repository = new MemoryReceiptRepository();
  const issueBoundary = boundary();
  const issuer = createHandoff(repository, issueBoundary);
  assert.deepEqual(
    await issuer.issue("another-operation"),
    { status: "operation_mismatch" }
  );
  assert.equal(issueBoundary.calls, 0);

  const issued = await issuer.issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(issued.status, "issued");
  if (issued.status !== "issued") {
    throw new Error("Trusted test evidence was not accepted");
  }
  assert.deepEqual(Object.keys(issued.receipt), ["receiptId"]);
  assert.equal(
    Object.values(issued.receipt).some(value =>
      new Set<string>([staffId, tenantId, objectId]).has(value)
    ),
    false
  );
  const stored = repository.records.get(issued.receipt.receiptId);
  assert.ok(stored);
  assert.equal(stored.record.operation, ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(JSON.stringify(stored.record).includes(staffId), false);
  assert.equal(JSON.stringify(stored.record).includes(tenantId), false);
  assert.equal(JSON.stringify(stored.record).includes(objectId), false);

  const secondProcess = createHandoff(repository);
  const concurrentResults = await Promise.all([
    secondProcess.consume(
      issued.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    secondProcess.consume(
      issued.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    )
  ]);
  assert.deepEqual(
    concurrentResults.map(result => result.status).sort(),
    ["authorized", "denied"]
  );
  assert.equal(stored.state, "consumed");
  assert.equal(stored.revision, 1);
  assert.deepEqual(
    await createHandoff(repository).consume(
      issued.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "denied" }
  );

  const mismatchedOperation = await issuer.issue(
    ENTRA_STAFF_ACCEPTANCE_OPERATION
  );
  assert.equal(mismatchedOperation.status, "issued");
  if (mismatchedOperation.status !== "issued") {
    throw new Error("Trusted test evidence was not accepted");
  }
  assert.deepEqual(
    await secondProcess.consume(mismatchedOperation.receipt, "other-op"),
    { status: "operation_mismatch" }
  );
  assert.equal(
    repository.records.get(mismatchedOperation.receipt.receiptId)?.state,
    "issued"
  );

  const expiredBoundary = boundary(() =>
    evidence({ verifiedAt: currentTime - 5 * 60 * 1000 - 1 })
  );
  assert.deepEqual(
    await createHandoff(new MemoryReceiptRepository(), expiredBoundary)
      .issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "expired" }
  );

  const staleEvidenceRepo = new MemoryReceiptRepository();
  const staleEvidenceIssued = await createHandoff(staleEvidenceRepo).issue(
    ENTRA_STAFF_ACCEPTANCE_OPERATION
  );
  assert.equal(staleEvidenceIssued.status, "issued");
  if (staleEvidenceIssued.status !== "issued") {
    throw new Error("Trusted test evidence was not accepted");
  }
  currentTime += 5 * 60 * 1000 + 1;
  assert.deepEqual(
    await createHandoff(staleEvidenceRepo).consume(
      staleEvidenceIssued.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "denied" }
  );
  currentTime -= 5 * 60 * 1000 + 1;

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
  assert.deepEqual(
    await createHandoff(new MemoryReceiptRepository(), inactiveBoundary)
      .issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );

  const unapprovedBoundary = boundary(() =>
    evidence({ administratorAuthorized: false })
  );
  assert.deepEqual(
    await createHandoff(new MemoryReceiptRepository(), unapprovedBoundary)
      .issue(ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );

  const mismatchedIdentityRepository = new MemoryReceiptRepository();
  const identityBound = await createHandoff(
    mismatchedIdentityRepository
  ).issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(identityBound.status, "issued");
  if (identityBound.status !== "issued") {
    throw new Error("Trusted test evidence was not accepted");
  }
  const changedTenantId = randomUUID();
  const changedBoundary = boundary(() =>
    evidence({
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
    })
  );
  assert.deepEqual(
    await createHandoff(mismatchedIdentityRepository, changedBoundary)
      .consume(identityBound.receipt, ENTRA_STAFF_ACCEPTANCE_OPERATION),
    { status: "denied" }
  );
  assert.equal(
    mismatchedIdentityRepository.records.get(
      identityBound.receipt.receiptId
    )?.state,
    "issued"
  );

  const storageFailureRepository = new MemoryReceiptRepository();
  storageFailureRepository.issueOutcome = "unavailable";
  assert.deepEqual(
    await createHandoff(storageFailureRepository).issue(
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "storage_unavailable" }
  );
  storageFailureRepository.issueOutcome = "issued";
  const storageFailureIssued = await createHandoff(
    storageFailureRepository
  ).issue(ENTRA_STAFF_ACCEPTANCE_OPERATION);
  assert.equal(storageFailureIssued.status, "issued");
  if (storageFailureIssued.status !== "issued") {
    throw new Error("Trusted test evidence was not accepted");
  }
  storageFailureRepository.consumeOutcome = "unavailable";
  assert.deepEqual(
    await createHandoff(storageFailureRepository).consume(
      storageFailureIssued.receipt,
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "storage_unavailable" }
  );
  assert.equal(
    storageFailureRepository.records.get(
      storageFailureIssued.receipt.receiptId
    )?.state,
    "issued"
  );

  const invalidReceiptRepository = new MemoryReceiptRepository();
  assert.deepEqual(
    await createHandoff(invalidReceiptRepository).consume(
      { receiptId: randomUUID() },
      ENTRA_STAFF_ACCEPTANCE_OPERATION
    ),
    { status: "invalid_receipt" }
  );
  assert.equal(invalidReceiptRepository.consumeCalls, 0);

  console.log("ENTRA_STAFF_ACCEPTANCE_HANDOFF_TESTS_PASSED=True");
}

void run();
