import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  createOperationalVisitorProvenance,
  createOperationalVisitorUpsertProvenance,
  parseVisitorProvenance,
  resolveVisitorEffectiveClassification,
  serializeVisitorProvenance
} from "../../src/contracts/visitorProvenance.v1";
import {
  createVisitorRecord,
  getVisitorById,
  updateVisitorRecord
} from "../../src/functions/_shared/visitorsRepository";
import {
  AzureTableVisitorsRepository
} from "../../src/repositories/visitorsRepository";

class MemoryTable {
  readonly entities = new Map<string, Record<string, unknown>>();
  createEntityCalls = 0;
  updateEntityCalls = 0;
  upsertEntityCalls = 0;
  beforeNextCreate?: () => Promise<void>;
  beforeNextUpdate?: () => Promise<void>;

  private key(partitionKey: string, rowKey: string): string {
    return `${partitionKey}/${rowKey}`;
  }

  async getEntity(partitionKey: string, rowKey: string): Promise<Record<string, unknown>> {
    const entity = this.entities.get(this.key(partitionKey, rowKey));
    if (!entity) {
      throw { code: "ResourceNotFound", statusCode: 404 };
    }
    return { ...entity };
  }

  async createEntity(entity: Record<string, unknown>): Promise<void> {
    this.createEntityCalls += 1;
    const beforeCreate = this.beforeNextCreate;
    this.beforeNextCreate = undefined;
    await beforeCreate?.();

    const key = this.key(
      String(entity.partitionKey),
      String(entity.rowKey)
    );
    if (this.entities.has(key)) {
      throw { code: "EntityAlreadyExists", statusCode: 409 };
    }
    this.entities.set(key, { ...entity });
  }

  async updateEntity(
    entity: Record<string, unknown>,
    mode: "Merge" | "Replace",
    options?: { etag?: string }
  ): Promise<void> {
    this.updateEntityCalls += 1;
    const beforeUpdate = this.beforeNextUpdate;
    this.beforeNextUpdate = undefined;
    await beforeUpdate?.();

    const key = this.key(
      String(entity.partitionKey),
      String(entity.rowKey)
    );
    const existing = this.entities.get(key);
    if (!existing) {
      throw { code: "ResourceNotFound", statusCode: 404 };
    }
    if (options?.etag !== existing.etag) {
      throw { code: "UpdateConditionNotSatisfied", statusCode: 412 };
    }
    this.entities.set(
      key,
      mode === "Merge"
        ? { ...existing, ...entity, etag: '"updated-winner-etag"' }
        : { ...entity, etag: '"updated-winner-etag"' }
    );
  }

  async upsertEntity(
    entity: Record<string, unknown>,
    mode: "Merge" | "Replace"
  ): Promise<void> {
    this.upsertEntityCalls += 1;
    const key = this.key(
      String(entity.partitionKey),
      String(entity.rowKey)
    );
    const existing = this.entities.get(key);
    this.entities.set(
      key,
      mode === "Merge" && existing
        ? { ...existing, ...entity }
        : { ...entity }
    );
  }

  async deleteEntity(partitionKey: string, rowKey: string): Promise<void> {
    this.entities.delete(this.key(partitionKey, rowKey));
  }

  seedEntity(entity: Record<string, unknown>): void {
    this.entities.set(
      this.key(String(entity.partitionKey), String(entity.rowKey)),
      { ...entity }
    );
  }

  async *listEntities(): AsyncGenerator<Record<string, unknown>> {
    for (const entity of this.entities.values()) {
      yield { ...entity };
    }
  }
}

const now = "2026-10-29T20:00:00.000Z";
const operationalProvenance = createOperationalVisitorProvenance(now);
const syntheticProvenance = Object.freeze({
  ...operationalProvenance,
  classification: "synthetic" as const
});

function assertOperationalProvenance(value: unknown): void {
  assert.deepEqual(value, operationalProvenance);
  assert.equal(Object.isFrozen(value), true);
}

async function testFunctionsRepository(): Promise<void> {
  const table = new MemoryTable();
  const dependencies = {
    getTableClient: () => table as unknown as TableClient,
    ensureTableExists: async () => {},
    now: () => now,
    newVisitorId: () => "visitor-functions-new"
  };
  const hostileCreateInput = {
    name: "Synthetic Caller Input",
    email: "ordinary@example.test",
    phone: "555-0101",
    provenanceJson: JSON.stringify(syntheticProvenance),
    classification: "synthetic"
  };

  const created = await createVisitorRecord(hostileCreateInput, dependencies);
  assert.equal(created.created, true);
  assert.equal(created.visitor.visitorId, "visitor-functions-new");
  assert.equal(created.visitor.name, hostileCreateInput.name);
  assert.equal(created.visitor.email, hostileCreateInput.email);
  assert.equal(created.visitor.phone, hostileCreateInput.phone);
  assertOperationalProvenance(created.visitor.provenance);

  const stored = await table.getEntity("VISITOR", "visitor-functions-new");
  assertOperationalProvenance(parseVisitorProvenance(stored.provenanceJson));

  const historical = {
    partitionKey: "VISITOR",
    rowKey: "visitor-functions-historical",
    name: "Historical Record",
    email: "historical@example.test",
    createdAt: now,
    updatedAt: now
  };
  await table.createEntity(historical);
  const historicalRead = await getVisitorById(
    "visitor-functions-historical",
    dependencies
  );
  assert.equal(historicalRead?.visitorId, historical.rowKey);
  assert.equal(historicalRead?.provenance, undefined);
  assert.equal(
    resolveVisitorEffectiveClassification(undefined),
    "historical_unclassified"
  );
  assert.deepEqual(
    await table.getEntity("VISITOR", "visitor-functions-historical"),
    historical
  );

  const updateInput = {
    name: "Updated Historical Record",
    provenanceJson: JSON.stringify(syntheticProvenance),
    classification: "synthetic"
  };
  const updated = await updateVisitorRecord(
    "visitor-functions-new",
    updateInput,
    { ...dependencies, now: () => "2026-10-29T20:01:00.000Z" }
  );
  assert.equal(updated?.name, "Updated Historical Record");
  assertOperationalProvenance(updated?.provenance);
  assert.equal(updated?.email, hostileCreateInput.email);
  assert.equal(updated?.phone, hostileCreateInput.phone);
  assert.equal(
    (await table.getEntity("VISITOR", "visitor-functions-new")).provenanceJson,
    stored.provenanceJson
  );

  const malformed = {
    partitionKey: "VISITOR",
    rowKey: "visitor-functions-malformed",
    name: "Malformed Provenance Record",
    createdAt: now,
    updatedAt: now,
    provenanceJson: JSON.stringify({
      classification: "synthetic",
      designatedAt: "not-a-date",
      source: "caller",
      actor: { type: "caller", id: "untrusted" },
      reason: "unknown"
    })
  };
  await table.createEntity(malformed);
  const malformedRead = await getVisitorById(
    "visitor-functions-malformed",
    dependencies
  );
  assert.equal(malformedRead?.visitorId, malformed.rowKey);
  assert.equal(malformedRead?.provenance, undefined);
  assert.equal(
    resolveVisitorEffectiveClassification(malformed.provenanceJson),
    "historical_unclassified"
  );
}

async function testSecondaryRepository(): Promise<void> {
  const table = new MemoryTable();
  const repository = new AzureTableVisitorsRepository({
    getTableClient: () => table as unknown as TableClient,
    now: () => now,
    newVisitorId: () => "visitor-secondary-new"
  });
  const hostileCreateInput = {
    name: "Secondary Synthetic Caller",
    email: "secondary@example.test",
    phone: "555-0102",
    provenance: syntheticProvenance,
    classification: "synthetic"
  };

  const created = await repository.create(hostileCreateInput);
  assert.equal(created.created, true);
  assert.equal(created.visitor.visitorId, "visitor-secondary-new");
  assert.equal(created.visitor.name, hostileCreateInput.name);
  assert.equal(created.visitor.email, hostileCreateInput.email);
  assert.equal(created.visitor.phone, hostileCreateInput.phone);
  assertOperationalProvenance(created.visitor.provenance);
  assertOperationalProvenance(
    parseVisitorProvenance(
      (await table.getEntity("VISITOR", created.visitor.visitorId))
        .provenanceJson
    )
  );

  const updateInput = {
    visitorId: "visitor-secondary-new",
    name: "Secondary Updated",
    email: " updated@example.test ",
    createdAt: now,
    updatedAt: now,
    provenance: syntheticProvenance,
    actor: { type: "caller", id: "spoofed" },
    source: "caller",
    reason: "synthetic_fixture"
  };
  const updated = await repository.upsert(updateInput);
  assert.equal(updated.name, updateInput.name);
  assert.equal(updated.email, "updated@example.test");
  assert.equal(updated.createdAt, now);
  assert.equal(updated.updatedAt, now);
  assertOperationalProvenance(updated.provenance);
  const updatedEntity = await table.getEntity(
    "VISITOR",
    "visitor-secondary-new"
  );
  assert.equal(updatedEntity.emailLower, "updated@example.test");
  assert.equal(updatedEntity.createdAt, now);
  assert.equal(updatedEntity.updatedAt, now);
  assert.equal(
    updatedEntity.provenanceJson,
    serializeVisitorProvenance(operationalProvenance)
  );

  const historicalEntity = {
    partitionKey: "VISITOR",
    rowKey: "visitor-secondary-historical",
    name: "Secondary Historical",
    email: "secondary-legacy@example.test",
    createdAt: now,
    updatedAt: now
  };
  await table.createEntity(historicalEntity);
  const historical = await repository.getById(historicalEntity.rowKey);
  assert.equal(historical?.visitorId, historicalEntity.rowKey);
  assert.equal(historical?.provenance, undefined);
  await repository.upsert({
    visitorId: historicalEntity.rowKey,
    name: "Secondary Historical Updated",
    email: historicalEntity.email as string,
    createdAt: now,
    updatedAt: now,
    provenance: syntheticProvenance
  });
  const historicalAfterUpdate = await table.getEntity(
    "VISITOR",
    historicalEntity.rowKey
  );
  assert.equal(historicalAfterUpdate.provenanceJson, undefined);
  assert.equal(
    resolveVisitorEffectiveClassification(
      historicalAfterUpdate.provenanceJson
    ),
    "historical_unclassified"
  );

  const hostileUpsertInput = {
    visitorId: "visitor-secondary-upsert-new",
    name: "Secondary New via Upsert",
    createdAt: now,
    updatedAt: now,
    provenance: syntheticProvenance,
    actor: { type: "administrator", id: "spoofed" },
    source: "canonical_visitor_create",
    reason: "new_visitor_record"
  };
  const newByUpsert = await repository.upsert(hostileUpsertInput);
  assert.deepEqual(newByUpsert.provenance, {
    ...operationalProvenance,
    source: "canonical_visitor_upsert_create",
    reason: "visitor_created_via_upsert"
  });
  assert.deepEqual(
    parseVisitorProvenance(
      (
        await table.getEntity(
          "VISITOR",
          "visitor-secondary-upsert-new"
        )
      ).provenanceJson
    ),
    createOperationalVisitorUpsertProvenance(now)
  );
  assert.equal(Object.isFrozen(newByUpsert.provenance), true);

  const upsertOriginal = await table.getEntity(
    "VISITOR",
    "visitor-secondary-new"
  );
  assertOperationalProvenance(parseVisitorProvenance(upsertOriginal.provenanceJson));
  assert.equal(
    upsertOriginal.provenanceJson,
    serializeVisitorProvenance(operationalProvenance)
  );
}

async function testConcurrentUpsertCreateRace(
  provenanceJson: string | undefined,
  visitorId: string
): Promise<void> {
  const table = new MemoryTable();
  const winnerCreatedAt = "2026-10-28T19:00:00.000Z";
  const winnerUpdatedAt = "2026-10-28T19:30:00.000Z";
  const winner: Record<string, unknown> = {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    name: "Concurrent Winner",
    email: "winner@example.test",
    emailLower: "winner@example.test",
    phone: "555-0199",
    createdAt: winnerCreatedAt,
    updatedAt: winnerUpdatedAt,
    etag: '"winner-etag"'
  };
  if (provenanceJson !== undefined) {
    winner.provenanceJson = provenanceJson;
  }

  table.beforeNextCreate = async () => table.seedEntity(winner);
  const repository = new AzureTableVisitorsRepository({
    getTableClient: () => table as unknown as TableClient,
    now: () => now
  });
  const input = {
    visitorId,
    name: "Upsert After Concurrent Create",
    email: " Updated@Example.Test ",
    createdAt: "2026-10-27T18:00:00.000Z",
    updatedAt: now,
    provenance: syntheticProvenance,
    actor: { type: "caller", id: "spoofed" },
    source: "caller",
    reason: "synthetic_fixture"
  };

  const result = await repository.upsert(input);
  const stored = await table.getEntity("VISITOR", visitorId);
  assert.equal(result.visitorId, visitorId);
  assert.equal(result.name, input.name);
  assert.equal(result.email, "Updated@Example.Test");
  assert.equal(result.createdAt, winnerCreatedAt);
  assert.equal(result.updatedAt, now);
  assert.equal(stored.rowKey, visitorId);
  assert.equal(stored.name, input.name);
  assert.equal(stored.email, "Updated@Example.Test");
  assert.equal(stored.emailLower, "updated@example.test");
  assert.equal(stored.phone, "555-0199");
  assert.equal(stored.createdAt, winnerCreatedAt);
  assert.equal(stored.updatedAt, now);
  assert.equal(
    Object.prototype.hasOwnProperty.call(stored, "provenanceJson"),
    provenanceJson !== undefined
  );
  assert.equal(stored.provenanceJson, provenanceJson);
  assert.equal(table.createEntityCalls, 1);
  assert.equal(table.updateEntityCalls, 1);
  assert.equal(table.upsertEntityCalls, 0);

  if (provenanceJson === undefined) {
    assert.equal(result.provenance, undefined);
  } else if (parseVisitorProvenance(provenanceJson)) {
    assertOperationalProvenance(result.provenance);
  } else {
    assert.equal(result.provenance, undefined);
  }
}

async function testConcurrentWinnerChangesBeforeMerge(): Promise<void> {
  const table = new MemoryTable();
  const visitorId = "visitor-race-etag-conflict";
  const winnerProvenance = serializeVisitorProvenance(
    createOperationalVisitorProvenance("2026-10-28T19:00:00.000Z")
  );
  const winner = {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    name: "Concurrent Winner",
    createdAt: "2026-10-28T19:00:00.000Z",
    updatedAt: "2026-10-28T19:30:00.000Z",
    provenanceJson: winnerProvenance,
    etag: '"winner-etag"'
  };
  table.beforeNextCreate = async () => table.seedEntity(winner);
  table.beforeNextUpdate = async () => {
    const changedWinner = await table.getEntity("VISITOR", visitorId);
    table.seedEntity({
      ...changedWinner,
      provenanceJson: serializeVisitorProvenance(
        createOperationalVisitorUpsertProvenance(
          "2026-10-29T19:00:00.000Z"
        )
      ),
      etag: '"changed-winner-etag"'
    });
  };
  const repository = new AzureTableVisitorsRepository({
    getTableClient: () => table as unknown as TableClient,
    now: () => now
  });

  await assert.rejects(
    repository.upsert({
      visitorId,
      name: "Must Not Retry",
      createdAt: now,
      updatedAt: now
    }),
    error => {
      assert.equal(
        (error as { code?: string }).code,
        "VISITOR_UPSERT_CREATE_CONFLICT"
      );
      assert.equal(
        (error as { reason?: string }).reason,
        "winner_changed_before_merge"
      );
      return true;
    }
  );

  const stored = await table.getEntity("VISITOR", visitorId);
  assert.equal(stored.name, winner.name);
  assert.equal(
    stored.provenanceJson,
    serializeVisitorProvenance(
      createOperationalVisitorUpsertProvenance(
        "2026-10-29T19:00:00.000Z"
      )
    )
  );
  assert.equal(stored.etag, '"changed-winner-etag"');
  assert.equal(table.createEntityCalls, 1);
  assert.equal(table.updateEntityCalls, 1);
  assert.equal(table.upsertEntityCalls, 0);
}

async function main(): Promise<void> {
  const valid = serializeVisitorProvenance(operationalProvenance);
  assertOperationalProvenance(parseVisitorProvenance(valid));
  assert.equal(
    resolveVisitorEffectiveClassification(valid),
    "operational"
  );
  assert.equal(
    parseVisitorProvenance(JSON.stringify(syntheticProvenance)),
    null
  );
  assert.equal(
    resolveVisitorEffectiveClassification(JSON.stringify(syntheticProvenance)),
    "historical_unclassified"
  );
  assert.equal(
    resolveVisitorEffectiveClassification("{ malformed json"),
    "historical_unclassified"
  );
  const contradictoryProvenance = {
    ...operationalProvenance,
    source: "canonical_visitor_upsert_create",
    reason: "new_visitor_record"
  };
  assert.equal(
    parseVisitorProvenance(JSON.stringify(contradictoryProvenance)),
    null
  );
  await testFunctionsRepository();
  await testSecondaryRepository();
  await testConcurrentUpsertCreateRace(
    serializeVisitorProvenance(operationalProvenance),
    "visitor-race-valid"
  );
  await testConcurrentUpsertCreateRace(undefined, "visitor-race-missing");
  await testConcurrentUpsertCreateRace(
    "{ malformed winner provenance",
    "visitor-race-malformed"
  );
  await testConcurrentWinnerChangesBeforeMerge();
  console.log("visitorProvenancePersistence.test.ts passed");
}

void main();
