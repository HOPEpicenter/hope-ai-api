import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { TableClient } from "@azure/data-tables";
import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";
import {
  readFormationEventAcquisition,
  type FormationEventEvidenceReadPort
} from "../../src/services/formation/readFormationEventAcquisition";

type IsolatedTableClientFactory = typeof import("../../src/functions/_shared/formationEventV1TableClient");
type ReadPortFactories = typeof import("../../src/services/formation/createFormationEventV1BackendReadPort");

const VISITOR_ID = "synthetic-v1-adapter-visitor-001";
const EVENT_ID = "synthetic-v1-adapter-event-001";
const OCCURRED_AT = "2030-02-03T04:05:06.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(OCCURRED_AT, EVENT_ID);

let getFormationEventV1TableClient: IsolatedTableClientFactory["getFormationEventV1TableClient"];
let createFormationEventV1BackendReadPort: ReadPortFactories["createFormationEventV1BackendReadPort"];
let createSyntheticFormationEventV1BackendReadPort: ReadPortFactories["createSyntheticFormationEventV1BackendReadPort"];

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return {
    visitorId: VISITOR_ID,
    eventId: EVENT_ID,
    occurredAt: OCCURRED_AT,
    ...overrides
  } as FormationEventEvidenceAcquisitionIdentityV1;
}

function eventRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    partitionKey: VISITOR_ID,
    rowKey: ROW_KEY,
    visitorId: VISITOR_ID,
    idempotencyKey: EVENT_ID,
    occurredAt: OCCURRED_AT,
    ...overrides
  };
}

function assertSafeResult(result: FormationEventEvidenceAcquisitionResultV1): void {
  assert.equal(result.contractVersion, "formation_event_evidence_acquisition.v1");
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.repairAuthorized, false);
  assert.equal(result.replayAuthorized, false);
  assert.equal(result.reconciliationAuthorized, false);
}

function setEnvironment(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function loadIsolatedModules(): void {
  const tableFactoryPath = require.resolve("../../src/functions/_shared/formationEventV1TableClient");
  const adapterPath = require.resolve("../../src/services/formation/createFormationEventV1BackendReadPort");
  delete require.cache[tableFactoryPath];
  delete require.cache[adapterPath];

  const tableFactory = require(tableFactoryPath) as IsolatedTableClientFactory;
  const adapter = require(adapterPath) as ReadPortFactories;
  getFormationEventV1TableClient = tableFactory.getFormationEventV1TableClient;
  createFormationEventV1BackendReadPort = adapter.createFormationEventV1BackendReadPort;
  createSyntheticFormationEventV1BackendReadPort = adapter.createSyntheticFormationEventV1BackendReadPort;
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  await test("isolated factory and adapter imports construct no Azure clients or issue network requests", () => {
    const restoreEnvironment = setEnvironment({
      STORAGE_CONNECTION_STRING: undefined,
      AzureWebJobsStorage: undefined,
      FORMATION_EVENTS_TABLE: "synthetic-import-only"
    });
    const clientFactoryDescriptor = Object.getOwnPropertyDescriptor(TableClient, "fromConnectionString");
    const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    const httpRequestDescriptor = Object.getOwnPropertyDescriptor(http, "request");
    const httpsRequestDescriptor = Object.getOwnPropertyDescriptor(https, "request");
    let azureClientConstructions = 0;
    let networkAttempts = 0;

    try {
      Object.defineProperty(TableClient, "fromConnectionString", {
        configurable: true,
        value: () => {
          azureClientConstructions++;
          throw new Error("Synthetic guard: Azure client construction during import");
        }
      });
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: async () => {
          networkAttempts++;
          throw new Error("Synthetic guard: network request during import");
        }
      });
      Object.defineProperty(http, "request", {
        configurable: true,
        writable: true,
        value: (..._args: unknown[]) => {
          networkAttempts++;
          throw new Error("Synthetic guard: HTTP request during import");
        }
      });
      Object.defineProperty(https, "request", {
        configurable: true,
        writable: true,
        value: (..._args: unknown[]) => {
          networkAttempts++;
          throw new Error("Synthetic guard: HTTPS request during import");
        }
      });

      loadIsolatedModules();
      assert.equal(azureClientConstructions, 0);
      assert.equal(networkAttempts, 0);
      assert.equal(require.cache[require.resolve("../../src/storage/tableClient")], undefined);
      assert.equal(require.cache[require.resolve("../../src/functions/_shared/formation")], undefined);
      assert.equal(require.cache[require.resolve("../../src/repositories/globalTimelineRepository")], undefined);
    } finally {
      if (clientFactoryDescriptor) Object.defineProperty(TableClient, "fromConnectionString", clientFactoryDescriptor);
      if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor);
      if (httpRequestDescriptor) Object.defineProperty(http, "request", httpRequestDescriptor);
      if (httpsRequestDescriptor) Object.defineProperty(https, "request", httpsRequestDescriptor);
      restoreEnvironment();
    }
  });

  await test("isolated backend factory preserves V1 table selection and connection-string precedence", () => {
    const restoreEnvironment = setEnvironment({
      STORAGE_CONNECTION_STRING: "synthetic-storage-preferred",
      AzureWebJobsStorage: "synthetic-legacy-storage",
      FORMATION_EVENTS_TABLE: "synthetic-formation-events"
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor(TableClient, "fromConnectionString");
    const calls: unknown[][] = [];
    const syntheticClient = { getEntity: async () => eventRecord() };

    try {
      loadIsolatedModules();
      Object.defineProperty(TableClient, "fromConnectionString", {
        configurable: true,
        value: (...args: unknown[]) => {
          calls.push(args);
          return syntheticClient;
        }
      });

      assert.equal(getFormationEventV1TableClient(), syntheticClient);
      assert.deepEqual(calls, [["synthetic-storage-preferred", "synthetic-formation-events"]]);
    } finally {
      if (originalDescriptor) Object.defineProperty(TableClient, "fromConnectionString", originalDescriptor);
      restoreEnvironment();
    }
  });

  await test("isolated backend factory retains default table and AzureWebJobsStorage fallback", () => {
    const restoreEnvironment = setEnvironment({
      STORAGE_CONNECTION_STRING: undefined,
      AzureWebJobsStorage: "synthetic-legacy-storage",
      FORMATION_EVENTS_TABLE: undefined
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor(TableClient, "fromConnectionString");
    const calls: unknown[][] = [];

    try {
      loadIsolatedModules();
      Object.defineProperty(TableClient, "fromConnectionString", {
        configurable: true,
        value: (...args: unknown[]) => {
          calls.push(args);
          return { getEntity: async () => eventRecord() };
        }
      });

      getFormationEventV1TableClient();
      assert.deepEqual(calls, [["synthetic-legacy-storage", "devFormationEvents"]]);

      process.env.STORAGE_CONNECTION_STRING = "";
      assert.throws(
        () => getFormationEventV1TableClient(),
        /Missing STORAGE_CONNECTION_STRING \(or AzureWebJobsStorage\)\./
      );
    } finally {
      if (originalDescriptor) Object.defineProperty(TableClient, "fromConnectionString", originalDescriptor);
      restoreEnvironment();
    }
  });

  await test("production factory takes no caller-controlled arguments and construction performs no reads or writes", () => {
    const restoreEnvironment = setEnvironment({
      STORAGE_CONNECTION_STRING: "synthetic-storage-only",
      AzureWebJobsStorage: undefined,
      FORMATION_EVENTS_TABLE: "synthetic-production-factory"
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor(TableClient, "fromConnectionString");
    let entityReads = 0;
    let writes = 0;
    const factoryCalls: unknown[][] = [];
    const syntheticClient = {
      getEntity: async () => {
        entityReads++;
        return eventRecord();
      },
      createEntity: async () => { writes++; },
      updateEntity: async () => { writes++; },
      deleteEntity: async () => { writes++; }
    };

    try {
      loadIsolatedModules();
      Object.defineProperty(TableClient, "fromConnectionString", {
        configurable: true,
        value: (...args: unknown[]) => {
          factoryCalls.push(args);
          return syntheticClient;
        }
      });

      assert.equal(createFormationEventV1BackendReadPort.length, 0);
      const readPort = createFormationEventV1BackendReadPort();
      assert.deepEqual(Reflect.ownKeys(readPort), ["getEntity"]);
      assert.equal(typeof readPort.getEntity, "function");
      assert.notEqual(readPort, syntheticClient);
      assert.notEqual(readPort.getEntity, syntheticClient.getEntity);
      assert.equal(entityReads, 0);
      assert.equal(writes, 0);
      assert.deepEqual(factoryCalls, [["synthetic-storage-only", "synthetic-production-factory"]]);
    } finally {
      if (originalDescriptor) Object.defineProperty(TableClient, "fromConnectionString", originalDescriptor);
      restoreEnvironment();
    }
  });

  await test("synthetic adapter exposes one callable read operation and obtains its client only from the injected seam", async () => {
    let factoryCalls = 0;
    let reads = 0;
    let writes = 0;
    let syntheticClient: { getEntity: (partitionKey: string, rowKey: string) => Promise<unknown> };
    syntheticClient = {
      getEntity(this: unknown, partitionKey: string, rowKey: string): Promise<unknown> {
        assert.equal(this, syntheticClient);
        assert.equal(partitionKey, VISITOR_ID);
        assert.equal(rowKey, ROW_KEY);
        reads++;
        return Promise.resolve(eventRecord());
      }
    };
    const readPort = createSyntheticFormationEventV1BackendReadPort(() => {
      factoryCalls++;
      return syntheticClient;
    });

    assert.equal(factoryCalls, 1);
    assert.deepEqual(Reflect.ownKeys(readPort), ["getEntity"]);
    assert.equal(typeof Object.getOwnPropertyDescriptor(readPort, "getEntity")?.value, "function");
    assert.notEqual(readPort, syntheticClient);
    assert.notEqual(readPort.getEntity, syntheticClient.getEntity);
    assert.equal(reads, 0);
    assert.equal(writes, 0);

    const result = await readFormationEventAcquisition(identity(), readPort);
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
    assert.equal(reads, 1);
    assert.equal(writes, 0);
    assertSafeResult(result);
  });

  await test("invalid identity is rejected by the existing evidence reader without an adapter read", async () => {
    let reads = 0;
    const readPort = createSyntheticFormationEventV1BackendReadPort(() => ({
      getEntity: async () => {
        reads++;
        return eventRecord();
      }
    }));

    const result = await readFormationEventAcquisition(identity({ visitorId: "visitor/invalid" }), readPort);
    assert.equal(result.status, "ambiguous");
    assert.equal(result.reasonCode, "identity_visitor_id_invalid_for_partition_key");
    assert.equal(reads, 0);
    assertSafeResult(result);
  });

  await test("verified EntityNotFound and unrelated rejected reads retain existing reader classification", async () => {
    let notFoundCalls = 0;
    let unrelatedCalls = 0;
    const notFound = createSyntheticFormationEventV1BackendReadPort(() => ({
      getEntity: async () => {
        notFoundCalls++;
        throw { statusCode: 404, code: "EntityNotFound" };
      }
    }));
    const unrelated = createSyntheticFormationEventV1BackendReadPort(() => ({
      getEntity: async () => {
        unrelatedCalls++;
        throw { statusCode: 500, code: "InternalError" };
      }
    }));

    const absentResult = await readFormationEventAcquisition(identity(), notFound);
    assert.equal(absentResult.status, "observed_absence");
    assert.equal(absentResult.reasonCode, "absence_observed_not_historical");
    assert.equal(absentResult.historicalAbsenceEstablished, false);
    assertSafeResult(absentResult);
    assert.equal(notFoundCalls, 1);

    const unavailableResult = await readFormationEventAcquisition(identity(), unrelated);
    assert.equal(unavailableResult.status, "unavailable");
    assert.equal(unavailableResult.reasonCode, "observation_unavailable");
    assertSafeResult(unavailableResult);
    assert.equal(unrelatedCalls, 1);
  });

  await test("malformed and hostile synthetic dependencies fail closed without invoking getters", () => {
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(null),
      /synthetic-only client factory/
    );
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(() => null),
      /plain synthetic client/
    );
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(() => ({
        getEntity: async () => eventRecord(),
        unexpected: true
      })),
      /plain synthetic client/
    );

    let getterCalls = 0;
    const accessorClient = Object.defineProperty({}, "getEntity", {
      enumerable: true,
      get: () => {
        getterCalls++;
        throw new Error("synthetic hostile getter");
      }
    });
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(() => accessorClient),
      /own data method/
    );
    assert.equal(getterCalls, 0);

    const hostileProxy = new Proxy({ getEntity: async () => eventRecord() }, {
      ownKeys: () => { throw new Error("synthetic proxy trap"); }
    });
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(() => hostileProxy),
      /plain synthetic client/
    );

    const factoryError = new Error("synthetic factory failure");
    assert.throws(
      () => createSyntheticFormationEventV1BackendReadPort(() => { throw factoryError; }),
      error => error === factoryError
    );
  });

  await test("production source adds no authorization, feature activation, endpoints, schedules, contact, or mutations", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../../src/services/formation/createFormationEventV1BackendReadPort.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf8");
    const writerPath = path.resolve(
      __dirname,
      "../../src/functions/_shared/formation.ts"
    );
    const writerSource = fs.readFileSync(writerPath, "utf8");

    assert.doesNotMatch(source, /\b(?:app|router)\.(?:http|timer)\s*\(/i);
    assert.doesNotMatch(source, /\b(?:setInterval|setTimeout|fetch)\s*\(/i);
    assert.doesNotMatch(source, /\b(?:createTable|createEntity|upsertEntity|updateEntity|deleteEntity|submitTransaction)\s*\(/i);
    assert.doesNotMatch(source, /\b(?:inspectFormationEvent|authorizeAuthenticated|FEATURE_FORMATION_EVENT)\b/i);
    assert.match(writerSource, /export function getFormationEventsTableClient\(\): TableClient \{\s*return getFormationEventV1TableClient\(\);\s*\}/);
    assert.doesNotMatch(source, /from ["'][^"']*formation\.["']/);
  });

  console.log(`Passed ${passed} FormationEvent V1 backend read adapter tests.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
