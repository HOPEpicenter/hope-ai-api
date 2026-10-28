import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import {
  FormationEventEvidenceReadPort,
  readFormationEventAcquisition
} from "../../src/services/formation/readFormationEventAcquisition";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";

const VISITOR = "synthetic-visitor-read-001";
const EVENT_ID = "synthetic-event-read-100";
const AT = "2030-01-01T00:00:00.000Z";
const OTHER_AT = "2030-01-01T00:00:01.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(AT, EVENT_ID);

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT, ...overrides } as FormationEventEvidenceAcquisitionIdentityV1;
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    partitionKey: VISITOR,
    rowKey: ROW_KEY,
    visitorId: VISITOR,
    id: EVENT_ID,
    occurredAt: AT,
    type: "SERVICE_ATTENDED",
    recordedAt: "2030-01-01T00:00:01.000Z",
    channel: "service",
    visibility: "staff",
    sensitivity: "none",
    idempotencyKey: EVENT_ID,
    ...overrides
  };
}

function port(
  getEntity: (partitionKey: string, rowKey: string) => Promise<unknown>
): FormationEventEvidenceReadPort {
  return { getEntity };
}

function assertSafety(result: FormationEventEvidenceAcquisitionResultV1): void {
  assert.equal(result.contractVersion, "formation_event_evidence_acquisition.v1");
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.historicalAbsenceEstablished, false);
  assert.equal(result.transactionallyComplete, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.repairAuthorized, false);
  assert.equal(result.replayAuthorized, false);
  assert.equal(result.reconciliationAuthorized, false);
}

async function expect(
  identityValue: unknown,
  readPort: unknown,
  status: FormationEventEvidenceAcquisitionResultV1["status"],
  reasonCode: FormationEventEvidenceAcquisitionResultV1["reasonCode"]
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const result = await readFormationEventAcquisition(
    identityValue as FormationEventEvidenceAcquisitionIdentityV1,
    readPort as FormationEventEvidenceReadPort
  );
  assert.equal(result.status, status);
  assert.equal(result.reasonCode, reasonCode);
  assertSafety(result);
  return result;
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  await test("production-shaped entity produces matching evidence", async () => {
    const result = await expect(
      identity(),
      port(async () => record()),
      "matching_evidence",
      "record_matches_trusted_identity"
    );
    assert.equal(result.candidateRowKey, ROW_KEY);
  });

  await test("trusted partition key and deterministic row key are passed to the reader", async () => {
    const calls: Array<[string, string]> = [];
    await expect(
      identity(),
      port(async (partitionKey, rowKey) => {
        calls.push([partitionKey, rowKey]);
        return record();
      }),
      "matching_evidence",
      "record_matches_trusted_identity"
    );
    assert.deepEqual(calls, [[VISITOR, ROW_KEY]]);
  });

  await test("missing or blank visitor ID causes zero reads", async () => {
    for (const visitorId of [undefined, "", "   "]) {
      let calls = 0;
      const identityValue = visitorId === undefined
        ? { eventId: EVENT_ID, occurredAt: AT }
        : identity({ visitorId });
      await expect(identityValue, port(async () => { calls++; return record(); }), "ambiguous", "identity_visitor_id_malformed");
      assert.equal(calls, 0);
    }
  });

  await test("missing or blank event ID causes zero reads", async () => {
    for (const eventId of [undefined, "", "   "]) {
      let calls = 0;
      const identityValue = eventId === undefined
        ? { visitorId: VISITOR, occurredAt: AT }
        : identity({ eventId });
      await expect(identityValue, port(async () => { calls++; return record(); }), "ambiguous", "identity_event_id_malformed");
      assert.equal(calls, 0);
    }
  });

  await test("invalid occurrence timestamp causes zero reads", async () => {
    let calls = 0;
    await expect(identity({ occurredAt: "not-a-timestamp" }), port(async () => { calls++; return record(); }), "ambiguous", "identity_occurred_at_invalid");
    assert.equal(calls, 0);
  });

  await test("forbidden Azure key characters and oversized keys cause zero reads", async () => {
    for (const identityValue of [
      identity({ visitorId: "visitor/invalid" }),
      identity({ visitorId: "v".repeat(1025) }),
      identity({ eventId: "event?invalid" }),
      identity({ eventId: "e".repeat(999) })
    ]) {
      let calls = 0;
      const result = await readFormationEventAcquisition(
        identityValue,
        port(async () => { calls++; return record(); })
      );
      assert.equal(result.status, "ambiguous");
      assert.equal(result.reasonCode.startsWith("identity_"), true);
      assertSafety(result);
      assert.equal(calls, 0);
    }
  });

  await test("explicit entity-not-found 404 is observed absence only", async () => {
    const result = await expect(
      identity(),
      port(async () => { throw { statusCode: 404, code: "EntityNotFound" }; }),
      "observed_absence",
      "absence_observed_not_historical"
    );
    assert.equal(result.historicalAbsenceEstablished, false);
  });

  await test("plain 404 without entity-specific evidence remains unavailable", async () => {
    await expect(identity(), port(async () => { throw { statusCode: 404 }; }), "unavailable", "observation_unavailable");
  });

  await test("conflicting outer 500 and nested 404 statuses remain unavailable", async () => {
    await expect(
      identity(),
      port(async () => {
        throw {
          statusCode: 500,
          code: "EntityNotFound",
          response: { status: 404 }
        };
      }),
      "unavailable",
      "observation_unavailable"
    );
  });

  await test("nested EntityNotFound with consistent 404 is recognized as observed absence", async () => {
    const result = await expect(
      identity(),
      port(async () => {
        throw {
          statusCode: 404,
          code: "EntityNotFound",
          response: {
            status: 404,
            parsedBody: { error: { code: "EntityNotFound" } }
          }
        };
      }),
      "observed_absence",
      "absence_observed_not_historical"
    );
    assert.equal(result.historicalAbsenceEstablished, false);
  });

  await test("outer EntityNotFound plus nested AuthenticationFailed remains unavailable", async () => {
    await expect(
      identity(),
      port(async () => {
        throw {
          statusCode: 404,
          code: "EntityNotFound",
          response: { parsedBody: { error: { code: "AuthenticationFailed" } } }
        };
      }),
      "unavailable",
      "observation_unavailable"
    );
  });

  await test("nested EntityNotFound plus outer InternalError remains unavailable", async () => {
    await expect(
      identity(),
      port(async () => {
        throw {
          statusCode: 404,
          code: "InternalError",
          response: { parsedBody: { error: { code: "EntityNotFound" } } }
        };
      }),
      "unavailable",
      "observation_unavailable"
    );
  });

  await test("mixed EntityNotFound and TableNotFound evidence remains unavailable", async () => {
    await expect(
      identity(),
      port(async () => {
        throw {
          statusCode: 404,
          code: "EntityNotFound",
          response: { parsedBody: { error: { code: "TableNotFound" } } }
        };
      }),
      "unavailable",
      "observation_unavailable"
    );
  });

  await test("TableNotFound 404 remains unavailable", async () => {
    await expect(identity(), port(async () => { throw { statusCode: 404, code: "TableNotFound" }; }), "unavailable", "observation_unavailable");
  });

  await test("nested TableNotFound 404 remains unavailable", async () => {
    await expect(
      identity(),
      port(async () => { throw { statusCode: 404, response: { parsedBody: { error: { code: "TableNotFound" } } } }; }),
      "unavailable",
      "observation_unavailable"
    );
  });

  await test("entity-not-found code without 404 remains unavailable", async () => {
    await expect(identity(), port(async () => { throw { statusCode: 500, code: "EntityNotFound" }; }), "unavailable", "observation_unavailable");
  });

  await test("authentication, timeout, and server failures remain unavailable", async () => {
    const failures: unknown[] = [
      { statusCode: 401, code: "AuthenticationFailed" },
      { statusCode: 403, code: "AuthorizationPermissionMismatch" },
      { code: "ETIMEDOUT" },
      { statusCode: 500, code: "InternalError" }
    ];
    for (const failure of failures) {
      await expect(identity(), port(async () => { throw failure; }), "unavailable", "observation_unavailable");
    }
  });

  await test("raw error and entity contents are never returned", async () => {
    const secretMarker = "synthetic-secret-error-message";
    const errorResult = await readFormationEventAcquisition(
      identity(),
      port(async () => { throw { statusCode: 500, code: "InternalError", message: secretMarker }; })
    );
    assertSafety(errorResult);
    assert.doesNotMatch(JSON.stringify(errorResult), new RegExp(secretMarker));

    const entityMarker = "synthetic-private-record-content";
    const entityResult = await readFormationEventAcquisition(
      identity(),
      port(async () => record({ summary: entityMarker }))
    );
    assertSafety(entityResult);
    assert.doesNotMatch(JSON.stringify(entityResult), new RegExp(entityMarker));
  });

  await test("malformed returned entities are ambiguous", async () => {
    for (const entity of [null, {}, "not-an-entity", { ...record(), unknownProperty: true }]) {
      await expect(identity(), port(async () => entity), "ambiguous", "record_malformed");
    }
  });

  await test("identity, row-key, partition-key, and timestamp mismatches remain ambiguous", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ visitorId: "synthetic-other-visitor" }, "visitor_id_mismatch"],
      [{ id: "synthetic-other-event" }, "event_id_mismatch"],
      [{ rowKey: "synthetic-other-row" }, "row_key_mismatch"],
      [{ partitionKey: "synthetic-other-partition" }, "partition_key_mismatch"],
      [{ occurredAt: OTHER_AT }, "occurred_at_mismatch"]
    ];
    for (const [override, reasonCode] of cases) {
      await expect(
        identity(),
        port(async () => record(override)),
        "ambiguous",
        reasonCode as FormationEventEvidenceAcquisitionResultV1["reasonCode"]
      );
    }
  });

  await test("actual V1 persisted records identify the event by idempotencyKey without id", async () => {
    // Shape persisted by recordFormationEventV1: no explicit id property.
    const v1Record = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
      const persisted: Record<string, unknown> = {
        partitionKey: VISITOR,
        rowKey: ROW_KEY,
        visitorId: VISITOR,
        idempotencyKey: EVENT_ID,
        occurredAt: AT,
        ...overrides
      };
      return persisted;
    };
    const matching = "record_matches_trusted_identity";

    assert.equal("id" in v1Record(), false);
    await expect(identity(), port(async () => v1Record()), "matching_evidence", matching);
    await expect(identity(), port(async () => record({ idempotencyKey: undefined })), "ambiguous", "record_malformed");
    const legacy = record();
    delete legacy.idempotencyKey;
    await expect(identity(), port(async () => legacy), "matching_evidence", matching);
    await expect(identity(), port(async () => record()), "matching_evidence", matching);

    const neither = v1Record();
    delete neither.idempotencyKey;
    await expect(identity(), port(async () => neither), "ambiguous", "record_malformed");

    await expect(identity(), port(async () => v1Record({ idempotencyKey: "synthetic-other-event" })), "ambiguous", "event_id_mismatch");
    const legacyOther = record({ id: "synthetic-other-event" });
    delete legacyOther.idempotencyKey;
    await expect(identity(), port(async () => legacyOther), "ambiguous", "event_id_mismatch");
    await expect(identity(), port(async () => record({ idempotencyKey: "synthetic-other-event" })), "ambiguous", "event_id_mismatch");
    await expect(identity(), port(async () => record({ id: "synthetic-other-event" })), "ambiguous", "event_id_mismatch");

    for (const invalid of [undefined, null, "", "   ", ` ${EVENT_ID}`, 42, {}, [], true]) {
      await expect(identity(), port(async () => v1Record({ idempotencyKey: invalid })), "ambiguous", "record_malformed");
      await expect(identity(), port(async () => record({ id: invalid })), "ambiguous", "record_malformed");
      await expect(identity(), port(async () => record({ idempotencyKey: invalid })), "ambiguous", "record_malformed");
      const legacyInvalid = record({ id: invalid });
      delete legacyInvalid.idempotencyKey;
      await expect(identity(), port(async () => legacyInvalid), "ambiguous", "record_malformed");
    }

    for (const key of ["id", "idempotencyKey"]) {
      const accessorRecord = v1Record();
      delete accessorRecord.idempotencyKey;
      Object.defineProperty(accessorRecord, key, { enumerable: true, get() { return EVENT_ID; } });
      await expect(identity(), port(async () => accessorRecord), "ambiguous", "record_malformed");
      const withBoth = record();
      Object.defineProperty(withBoth, key, { enumerable: true, get() { return EVENT_ID; } });
      await expect(identity(), port(async () => withBoth), "ambiguous", "record_malformed");
    }

    const nonIdentity: Array<[Record<string, unknown>, string]> = [
      [{ visitorId: "synthetic-other-visitor" }, "visitor_id_mismatch"],
      [{ rowKey: "synthetic-other-row" }, "row_key_mismatch"],
      [{ partitionKey: "synthetic-other-partition" }, "partition_key_mismatch"],
      [{ occurredAt: OTHER_AT }, "occurred_at_mismatch"]
    ];
    for (const [override, reasonCode] of nonIdentity) {
      await expect(
        identity(),
        port(async () => v1Record(override)),
        "ambiguous",
        reasonCode as FormationEventEvidenceAcquisitionResultV1["reasonCode"]
      );
    }

    for (const invalidIdentity of [{ eventId: "" }, { eventId: "   " }, { visitorId: undefined }, { occurredAt: "nope" }]) {
      let calls = 0;
      await expect(
        identity(invalidIdentity),
        port(async () => { calls++; return v1Record(); }),
        "ambiguous",
        (Object.keys(invalidIdentity)[0] === "eventId"
          ? "identity_event_id_malformed"
          : Object.keys(invalidIdentity)[0] === "visitorId"
            ? "identity_visitor_id_malformed"
            : "identity_occurred_at_invalid")
      );
      assert.equal(calls, 0);
    }

    const marker = "synthetic-private-v1-content";
    const content = await readFormationEventAcquisition(
      identity(),
      port(async () => v1Record({ summary: marker, metadata: marker }))
    );
    assertSafety(content);
    assert.equal(content.status, "matching_evidence");
    assert.doesNotMatch(JSON.stringify(content), new RegExp(marker));
  });

  await test("hostile error getters and proxies fail closed", async () => {
    const getterError = {
      statusCode: 404,
      get code(): never {
        throw new Error("synthetic hostile getter");
      }
    };
    await expect(identity(), port(async () => { throw getterError; }), "unavailable", "observation_unavailable");

    const nestedGetterError = {
      statusCode: 404,
      code: "EntityNotFound",
      details: {
        get code(): never {
          throw new Error("synthetic nested hostile getter");
        }
      }
    };
    await expect(identity(), port(async () => { throw nestedGetterError; }), "unavailable", "observation_unavailable");

    const proxyError = new Proxy({}, {
      getOwnPropertyDescriptor(): never {
        throw new Error("synthetic hostile proxy");
      }
    });
    await expect(identity(), port(async () => { throw proxyError; }), "unavailable", "observation_unavailable");
  });

  await test("rejected read triggers exactly one read", async () => {
    let calls = 0;
    await expect(
      identity(),
      port(async () => {
        calls++;
        throw new Error("synthetic read failure");
      }),
      "unavailable",
      "observation_unavailable"
    );
    assert.equal(calls, 1);
  });

  await test("caller identity mutation before successful read completion cannot change assessment", async () => {
    const callerIdentity = identity() as unknown as {
      visitorId: string;
      eventId: string;
      occurredAt: string;
    };
    const result = await expect(
      callerIdentity,
      port(async (partitionKey, rowKey) => {
        assert.equal(partitionKey, VISITOR);
        assert.equal(rowKey, ROW_KEY);
        callerIdentity.visitorId = "synthetic-mutated-visitor";
        callerIdentity.eventId = "synthetic-mutated-event";
        callerIdentity.occurredAt = OTHER_AT;
        return record();
      }),
      "matching_evidence",
      "record_matches_trusted_identity"
    );
    assert.equal(result.candidateRowKey, ROW_KEY);
  });

  await test("caller identity mutation before rejected read cannot change error assessment", async () => {
    const callerIdentity = identity() as unknown as {
      visitorId: string;
      eventId: string;
      occurredAt: string;
    };
    const result = await expect(
      callerIdentity,
      port(async (partitionKey, rowKey) => {
        assert.equal(partitionKey, VISITOR);
        assert.equal(rowKey, ROW_KEY);
        callerIdentity.visitorId = "synthetic-mutated-visitor";
        callerIdentity.eventId = "synthetic-mutated-event";
        callerIdentity.occurredAt = OTHER_AT;
        throw { statusCode: 404, code: "EntityNotFound" };
      }),
      "observed_absence",
      "absence_observed_not_historical"
    );
    assert.equal(result.candidateRowKey, ROW_KEY);
  });

  await test("identity accessors and proxies fail closed without reads", async () => {
    let calls = 0;
    const getterIdentity = {
      get visitorId(): string {
        throw new Error("synthetic hostile identity getter");
      },
      eventId: EVENT_ID,
      occurredAt: AT
    };
    const getterResult = await readFormationEventAcquisition(
      getterIdentity as unknown as FormationEventEvidenceAcquisitionIdentityV1,
      port(async () => { calls++; return record(); })
    );
    assert.equal(getterResult.status, "ambiguous");
    assertSafety(getterResult);

    const proxyIdentity = new Proxy(identity(), {});
    const proxyResult = await readFormationEventAcquisition(proxyIdentity, port(async () => { calls++; return record(); }));
    assert.equal(proxyResult.status, "ambiguous");
    assertSafety(proxyResult);
    assert.equal(calls, 0);
  });

  await test("missing, malformed, and unexpected read ports cause zero reads", async () => {
    let calls = 0;
    await expect(identity(), undefined, "unavailable", "observation_unavailable");
    await expect(identity(), {}, "unavailable", "observation_unavailable");
    await expect(identity(), { getEntity: async () => { calls++; return record(); }, unexpected: true }, "unavailable", "observation_unavailable");

    const getterPort = {
      get getEntity(): FormationEventEvidenceReadPort["getEntity"] {
        calls++;
        return async () => record();
      }
    };
    await expect(identity(), getterPort, "unavailable", "observation_unavailable");

    const proxyPort = new Proxy({}, {
      ownKeys(): never {
        throw new Error("synthetic hostile read port");
      }
    });
    await expect(identity(), proxyPort, "unavailable", "observation_unavailable");
    assert.equal(calls, 0);
  });

  await test("request and returned entity are not mutated", async () => {
    const request = Object.freeze(identity());
    const entity = Object.freeze(record());
    const requestBefore = JSON.stringify(request);
    const entityBefore = JSON.stringify(entity);
    await expect(request, port(async () => entity), "matching_evidence", "record_matches_trusted_identity");
    assert.equal(JSON.stringify(request), requestBefore);
    assert.equal(JSON.stringify(entity), entityBefore);
  });

  await test("source has no Azure client, credentials, network, or writer dependencies", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/services/formation/readFormationEventAcquisition.ts"),
      "utf8"
    );
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(imports, [
      "util",
      "../../contracts/formationEventEvidenceAcquisition.v1",
      "../../domain/formation/assessFormationEventAcquisition"
    ]);
    assert.doesNotMatch(source, /@azure|process\.env|\bfetch\s*\(|https?:\/\/|recordFormationEvent|createEntity|upsertEntity|deleteEntity|setTimeout|setInterval/);
  });

  console.log(`Formation event read adapter assertions passed (${passed} tests).`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
