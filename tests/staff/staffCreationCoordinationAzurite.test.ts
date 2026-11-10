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
  STAFF_SECURITY_METADATA_HEAD,
  STAFF_SECURITY_METADATA_RECEIPT_PREFIX
} from "../../src/repositories/staffEventsRepository";

import {
  coordinateStaffCreation
} from "../../src/services/staff/coordinateStaffCreation";

import type {
  StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";

if (process.env.STORAGE_CONNECTION_STRING !==
    "UseDevelopmentStorage=true") {
  throw new Error("Local Azurite-only execution required");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw new Error("Unapproved Azurite table port");
}

const connection = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

// Emulator account key above is the public Azurite development
// credential, not a production or user credential.

const tenant = "11111111-1111-4111-8111-111111111111";
const object = "22222222-2222-4222-8222-222222222222";

function table(prefix: string): TableClient {
  const name = prefix + randomBytes(8).toString("hex");
  return TableClient.fromConnectionString(
    connection,
    name,
    { allowInsecureConnection: true }
  );
}

type Fixture = {
  binding: TableClient;
  canonical: TableClient;
  repository: OAuthStaffSecurityStorageRepository;
};

async function fixture(): Promise<Fixture> {
  const binding = table("BindCoord");
  const canonical = table("StaffCoord");

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

function newEvent(staffId: string): StaffEvent {
  return {
    eventId: "evt-" + randomUUID().replace(/-/g, ""),
    staffId,
    actorId: "staff-admin",
    type: "staff.created",
    occurredAt: new Date().toISOString(),
    data: {
      displayName: "Synthetic " + staffId,
      status: "active",
      entraTenantId: tenant,
      entraObjectId: object
    }
  };
}

function ports(f: Fixture) {
  return {
    reserveBinding: (request: Parameters<
      OAuthStaffSecurityStorageRepository["reserveBinding"]
    >[0]) => f.repository.reserveBinding(request),

    createCanonical: (event: StaffEvent) =>
      submitStaffScopedAtomicCreation(event, f.canonical, true)
  };
}

function assertNoAuthority(value: {
  authoritative: boolean;
  executionPermitted: boolean;
  retryPermitted: boolean;
  automaticRecoveryPermitted: boolean;
  productionWriterFenced: boolean;
  productionRolloutPermitted: boolean;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionWriterFenced, false);
  assert.equal(value.productionRolloutPermitted, false);
}

async function verifySuccess(): Promise<void> {
  const f = await fixture();

  try {
    const event = newEvent("staff-success");
    const operationId = randomUUID();

    const outcome = await coordinateStaffCreation(
      event, operationId, ports(f), true
    );

    assert.equal(outcome.status, "both_acknowledged");
    assert.equal(outcome.reconciliationRequired, true);
    assertNoAuthority(outcome);

    const head = await f.canonical.getEntity<{
      revision: number;
      state: string;
    }>(event.staffId, STAFF_SECURITY_METADATA_HEAD);

    assert.equal(head.revision, 0);
    assert.equal(head.state, "active");

    const storedEvent = await f.canonical.getEntity<{
      type: string;
      dataJson: string;
    }>(
      event.staffId,
      `${event.occurredAt}__${event.eventId}`
    );

    assert.equal(storedEvent.type, "staff.created");
    assert.deepEqual(JSON.parse(storedEvent.dataJson), event.data);

    const receipt = await f.canonical.getEntity<{
      kind: string;
    }>(
      event.staffId,
      `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
    );

    assert.equal(receipt.kind, "staff.creation.prototype");

    const evidence = await f.repository.inspectReservation({
      tenantId: tenant,
      objectId: object,
      staffId: event.staffId,
      operationId
    });

    assert.equal(evidence.status, "observed_consistent");
    assert.equal(evidence.executionPermitted, false);

    console.log(
      "[PASS] Both real transactions acknowledged; evidence remains non-authorizing"
    );
  } finally {
    await cleanup(f);
  }
}

async function verifyCompetingClaims(): Promise<void> {
  const f = await fixture();

  try {
    const first = newEvent("staff-compete-a");
    const second = newEvent("staff-compete-b");

    const outcomes = await Promise.all([
      coordinateStaffCreation(first, randomUUID(), ports(f), true),
      coordinateStaffCreation(second, randomUUID(), ports(f), true)
    ]);

    const acknowledged = outcomes.filter(
      item => item.status === "both_acknowledged"
    );

    assert.equal(acknowledged.length, 1);

    for (const outcome of outcomes) {
      assertNoAuthority(outcome);
    }

    const winner = outcomes[0].status === "both_acknowledged"
      ? first
      : second;

    const loser = winner.staffId === first.staffId
      ? second
      : first;

    const binding = await f.binding.getEntity<{
      staffId: string;
    }>(
      STAFF_SECURITY_PROTOTYPE_PARTITION,
      `binding-${tenant}-${object}`
    );

    assert.equal(binding.staffId, winner.staffId);

    await assert.rejects(
      f.canonical.getEntity(
        loser.staffId,
        STAFF_SECURITY_METADATA_HEAD
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );

    console.log(
      "[PASS] Competing real binding reservations permit one canonical creator"
    );
  } finally {
    await cleanup(f);
  }
}

async function verifyCanonicalConflict(): Promise<void> {
  const f = await fixture();

  try {
    const event = newEvent("staff-existing-head");

    await f.canonical.createEntity({
      partitionKey: event.staffId,
      rowKey: STAFF_SECURITY_METADATA_HEAD,
      revision: 0,
      state: "active"
    });

    const operationId = randomUUID();

    const outcome = await coordinateStaffCreation(
      event, operationId, ports(f), true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(outcome.stage, "canonical_creation");
    assert.equal(outcome.reconciliationRequired, true);
    assertNoAuthority(outcome);

    const evidence = await f.repository.inspectReservation({
      tenantId: tenant,
      objectId: object,
      staffId: event.staffId,
      operationId
    });

    assert.equal(evidence.status, "observed_consistent");

    await assert.rejects(
      f.canonical.getEntity(
        event.staffId,
        `${event.occurredAt}__${event.eventId}`
      ),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );

    console.log(
      "[PASS] Canonical conflict leaves reservation for reconciliation"
    );
  } finally {
    await cleanup(f);
  }
}

async function verifyLostAcknowledgement(): Promise<void> {
  const f = await fixture();

  try {
    const event = newEvent("staff-ack-loss");
    const operationId = randomUUID();
    let canonicalSubmissions = 0;

    const outcome = await coordinateStaffCreation(
      event,
      operationId,
      {
        reserveBinding: request =>
          f.repository.reserveBinding(request),

        createCanonical: input =>
          submitStaffScopedAtomicCreation(
            input,
            {
              submitTransaction: async (actions: TransactionAction[]) => {
                canonicalSubmissions++;
                await f.canonical.submitTransaction(actions);
                throw new Error("synthetic acknowledgement loss");
              }
            },
            true
          )
      },
      true
    );

    assert.equal(outcome.status, "uncertain");
    assert.equal(outcome.stage, "canonical_creation");
    assert.equal(outcome.reconciliationRequired, true);
    assert.equal(canonicalSubmissions, 1);
    assertNoAuthority(outcome);

    // The transaction actually committed despite the
    // application receiving an uncertain outcome.
    const receipt = await f.canonical.getEntity<{
      kind: string;
    }>(
      event.staffId,
      `${STAFF_SECURITY_METADATA_RECEIPT_PREFIX}${event.eventId}`
    );

    assert.equal(receipt.kind, "staff.creation.prototype");

    console.log(
      "[PASS] Lost acknowledgement preserves uncertainty without retry"
    );
  } finally {
    await cleanup(f);
  }
}

async function main(): Promise<void> {
  await verifySuccess();
  await verifyCompetingClaims();
  await verifyCanonicalConflict();
  await verifyLostAcknowledgement();

  console.log(
    "[PASS] Real Azurite cross-partition Staff coordination regressions"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});