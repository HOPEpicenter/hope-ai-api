import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient, type TransactionAction } from "@azure/data-tables";
import {
  OAuthStaffSecurityStorageRepository,
  STAFF_SECURITY_PROTOTYPE_PARTITION,
  STAFF_SECURITY_HEAD_ROW
} from "../../src/repositories/oauthStaffSecurityStorageRepository";
import {
  submitStaffScopedAtomicCreation
} from "../../src/repositories/staffScopedAtomicCreation";
import {
  inspectStaffCreationEvidence
} from "../../src/repositories/inspectStaffCreationEvidence";
import {
  coordinateStaffCreation
} from "../../src/services/staff/coordinateStaffCreation";
import {
  reconcileStaffCreationEvidence
} from "../../src/services/staff/reconcileStaffCreationEvidence";
import {
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";
import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";

if (process.env.STORAGE_CONNECTION_STRING !==
    "UseDevelopmentStorage=true") {
  throw new Error("Explicit local Azurite configuration required");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT;

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved local Azurite Table port");
}

// The account below is Azurite's public development-only account.
// Never use it for a real Azure Storage account.
const connection = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");
const tenant = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";

function table(prefix: string): TableClient {
  return TableClient.fromConnectionString(
    connection,
    prefix + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
}

type Fixture = {
  binding: TableClient;
  canonical: TableClient;
  repository: OAuthStaffSecurityStorageRepository;
};

async function fixture(): Promise<Fixture> {
  const binding = table("BindRecon");
  const canonical = table("StaffRecon");

  await binding.createTable();

  try {
    await canonical.createTable();

    await binding.createEntity({
      partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
      rowKey: STAFF_SECURITY_HEAD_ROW,
      revision: 0,
      state: "active"
    });
  } catch (error) {
    await canonical.deleteTable().catch(() => undefined);
    await binding.deleteTable().catch(() => undefined);
    throw error;
  }

  return {
    binding,
    canonical,
    repository: new OAuthStaffSecurityStorageRepository(binding)
  };
}

async function cleanup(f: Fixture): Promise<void> {
  await f.canonical.deleteTable();
  await f.binding.deleteTable();
}

function eventFor(staffId: string): StaffEvent {
  return {
    eventId: "evt-" + randomUUID().replace(/-/g, ""),
    staffId,
    actorId: "staff-admin",
    type: "staff.created",
    occurredAt: new Date().toISOString(),
    data: {
      displayName: "Synthetic Staff",
      status: "active",
      entraTenantId: tenant,
      entraObjectId: objectId
    }
  };
}

function reservationRequest(event: StaffEvent, operationId: string) {
  return {
    tenantId: tenant,
    objectId,
    staffId: event.staffId,
    operationId
  };
}

function reconciliationPorts(f: Fixture) {
  return {
    inspectReservation: (request: Parameters<
      OAuthStaffSecurityStorageRepository["inspectReservation"]
    >[0]) => f.repository.inspectReservation(request),

    inspectCanonical: (event: StaffEvent) =>
      inspectStaffCreationEvidence(event, f.canonical, true)
  };
}

function noAuthority(value: {
  authoritative: boolean;
  executionPermitted: boolean;
  retryPermitted: boolean;
  automaticRecoveryPermitted: boolean;
  reservationReleasePermitted: boolean;
  productionWriterFenced: boolean;
  productionRolloutPermitted: boolean;
  reconciliationRequired: boolean;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.reservationReleasePermitted, false);
  assert.equal(value.productionWriterFenced, false);
  assert.equal(value.productionRolloutPermitted, false);
  assert.equal(value.reconciliationRequired, true);
}

async function testMatchingEvidence(): Promise<void> {
  const f = await fixture();

  try {
    const event = eventFor("staff-recon-both");
    const operation = randomUUID();

    const creation = await coordinateStaffCreation(
      event,
      operation,
      {
        reserveBinding: request =>
          f.repository.reserveBinding(request),
        createCanonical: input =>
          submitStaffScopedAtomicCreation(input, f.canonical, true)
      },
      true
    );

    assert.equal(creation.status, "both_acknowledged");

    const evidence = await reconcileStaffCreationEvidence(
      event, operation, reconciliationPorts(f), true
    );

    assert.equal(evidence.status, "observed_both");
    noAuthority(evidence);

    console.log("[PASS] Two real partitions independently observed");
  } finally {
    await cleanup(f);
  }
}

async function testReservationOnly(): Promise<void> {
  const f = await fixture();

  try {
    const event = eventFor("staff-recon-partial");
    const operation = randomUUID();

    const reservation = await f.repository.reserveBinding(
      reservationRequest(event, operation)
    );

    assert.equal(reservation.status, "committed");

    const evidence = await reconcileStaffCreationEvidence(
      event, operation, reconciliationPorts(f), true
    );

    assert.equal(evidence.status, "incomplete_or_unavailable");
    noAuthority(evidence);

    console.log("[PASS] Reservation-only state stays unresolved");
  } finally {
    await cleanup(f);
  }
}

async function testConflictingCanonical(): Promise<void> {
  const f = await fixture();

  try {
    const event = eventFor("staff-recon-conflict");
    const operation = randomUUID();

    const reservation = await f.repository.reserveBinding(
      reservationRequest(event, operation)
    );

    assert.equal(reservation.status, "committed");

    const creation = await submitStaffScopedAtomicCreation(
      event, f.canonical, true
    );

    assert.equal(creation.status, "committed");

    // Simulate corruption in an isolated test table.
    await f.canonical.updateEntity(
      {
        partitionKey: event.staffId,
        rowKey: `${event.occurredAt}__${event.eventId}`,
        dataJson: JSON.stringify({ displayName: "Different Staff" })
      },
      "Merge"
    );

    const evidence = await reconcileStaffCreationEvidence(
      event, operation, reconciliationPorts(f), true
    );

    assert.equal(evidence.status, "conflicting");
    noAuthority(evidence);

    console.log("[PASS] Conflicting canonical event rejected");
  } finally {
    await cleanup(f);
  }
}

async function testLostAcknowledgement(): Promise<void> {
  const f = await fixture();

  try {
    const event = eventFor("staff-recon-lost-ack");
    const operation = randomUUID();
    let submissions = 0;

    const creation = await coordinateStaffCreation(
      event,
      operation,
      {
        reserveBinding: request =>
          f.repository.reserveBinding(request),

        createCanonical: input =>
          submitStaffScopedAtomicCreation(
            input,
            {
              submitTransaction: async (actions: TransactionAction[]) => {
                submissions++;
                await f.canonical.submitTransaction(actions);
                throw new Error("synthetic acknowledgment loss");
              }
            },
            true
          )
      },
      true
    );

    assert.equal(creation.status, "uncertain");
    assert.equal(submissions, 1);

    const evidence = await reconcileStaffCreationEvidence(
      event, operation, reconciliationPorts(f), true
    );

    assert.equal(evidence.status, "observed_both");
    noAuthority(evidence);

    const receipt = await f.canonical.getEntity(
      event.staffId,
      `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
    );

    assert.equal(receipt.kind, "staff.creation.prototype");

    console.log(
      "[PASS] Lost acknowledgment independently observed without retry"
    );
  } finally {
    await cleanup(f);
  }
}

async function main(): Promise<void> {
  await testMatchingEvidence();
  await testReservationOnly();
  await testConflictingCanonical();
  await testLostAcknowledgement();

  console.log("[PASS] Real Staff creation reconciliation regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});