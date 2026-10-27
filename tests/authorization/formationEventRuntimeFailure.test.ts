import assert from "node:assert/strict";
import { TableClient } from "@azure/data-tables";
import {
  FormationEventInput,
  FormationEventType
} from "../../src/domain/formation/phase3_1_scope";
import type { RecordFormationEventRuntime } from "../../src/domain/formation/recordFormationEvent";
import { insertFormationEvent } from "../../src/storage/formation/formationEventsRepo";
import {
  FormationProfileEntity,
  getFormationProfile,
  upsertFormationProfile
} from "../../src/storage/formation/formationProfilesRepo";
import { ensureTableExists } from "../../src/shared/storage/ensureTableExists";

/*
 * Fully synthetic runtime-failure characterization for recordFormationEvent.
 *
 * Isolation notes (the runtime seam alone is not treated as proof of isolation):
 * - src/storage/tableClient.ts (reached through GlobalTimelineRepository) throws at
 *   import time unless STORAGE_CONNECTION_STRING is set. This test must not set or read
 *   environment settings, so that one module is replaced in require.cache by a stub that
 *   counts and rejects any use. The recorder is loaded only after the stub is installed.
 * - TableClient.fromConnectionString is replaced by a counting thrower for the duration
 *   of the test, so any real Azure client construction fails the run.
 * - Every runtime member is wrapped, logged and required to receive only in-memory tables.
 *
 * Test-local casts (unavoidable):
 * - MemoryTable -> TableClient: only the methods used by the recorder and the real
 *   repo helpers are implemented.
 * - The require.cache stub entry -> NodeModule.
 * - TableClient.fromConnectionString patching.
 */

type Row = Record<string, unknown>;
type Fault = "none" | "before" | "after";
type RuntimeKey = keyof RecordFormationEventRuntime;
type Recorder = typeof import("../../src/domain/formation/recordFormationEvent");

const CONNECTION = "synthetic-connection-string";
const VISITOR = "synthetic-visitor-001";
const EVENT_ID = "synthetic-event-001";
const OCCURRED_AT = "2030-01-01T00:00:00.000Z";
const ROW_KEY = `${OCCURRED_AT}__${EVENT_ID}`;
const DUPLICATE_FILTER = `PartitionKey eq '${VISITOR}' and id eq '${EVENT_ID}'`;

const RUNTIME_KEYS: readonly RuntimeKey[] = [
  "getFormationEventsTableClient",
  "getFormationProfilesTableClient",
  "ensureTableExists",
  "getFormationProfile",
  "insertFormationEvent",
  "appendGlobalTimeline",
  "upsertFormationProfile"
];

function statusError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

class MemoryTable {
  readonly rows = new Map<string, Row>();
  createAttempts = 0;
  upsertAttempts = 0;
  listFilters: string[] = [];
  upsertModes: unknown[] = [];

  constructor(
    readonly tableName: string,
    private readonly storageLog: string[],
    private readonly writeFault: Fault = "none"
  ) {}

  private key(partitionKey: unknown, rowKey: unknown): string {
    return `${String(partitionKey)}|${String(rowKey)}`;
  }

  seed(entity: Row): void {
    this.rows.set(this.key(entity.partitionKey, entity.rowKey), { ...entity });
  }

  async createTable(): Promise<void> {
    this.storageLog.push(`${this.tableName}.createTable`);
  }

  async getEntity(partitionKey: string, rowKey: string): Promise<Row> {
    this.storageLog.push(`${this.tableName}.getEntity`);
    const row = this.rows.get(this.key(partitionKey, rowKey));
    if (!row) throw statusError("synthetic_not_found", 404);
    return { ...row };
  }

  async createEntity(entity: Row): Promise<void> {
    this.storageLog.push(`${this.tableName}.createEntity`);
    this.createAttempts++;
    if (this.writeFault === "before") {
      throw statusError("synthetic_event_pre_write_failure", 500);
    }
    const key = this.key(entity.partitionKey, entity.rowKey);
    if (this.rows.has(key)) throw statusError("synthetic_conflict", 409);
    this.rows.set(key, { ...entity });
    if (this.writeFault === "after") {
      throw statusError("synthetic_event_lost_acknowledgement", 500);
    }
  }

  async upsertEntity(entity: Row, mode?: unknown): Promise<void> {
    this.storageLog.push(`${this.tableName}.upsertEntity`);
    this.upsertAttempts++;
    this.upsertModes.push(mode);
    if (this.writeFault === "before") {
      throw statusError("synthetic_profile_pre_write_failure", 500);
    }
    this.rows.set(this.key(entity.partitionKey, entity.rowKey), { ...entity });
    if (this.writeFault === "after") {
      throw statusError("synthetic_profile_lost_acknowledgement", 500);
    }
  }

  async *listEntities(options?: {
    queryOptions?: { filter?: string };
  }): AsyncGenerator<Row> {
    this.storageLog.push(`${this.tableName}.listEntities`);
    const filter = options?.queryOptions?.filter ?? "";
    this.listFilters.push(filter);
    const match = /^PartitionKey eq '(.*)' and id eq '(.*)'$/.exec(filter);
    assert.ok(match, `unexpected synthetic filter: ${filter}`);
    for (const row of this.rows.values()) {
      if (row.partitionKey === match[1] && row.id === match[2]) {
        yield { ...row };
      }
    }
  }
}

function asTableClient(table: MemoryTable): TableClient {
  return table as unknown as TableClient;
}

type Faults = {
  eventWrite?: Fault;
  timeline?: Fault;
  profileWrite?: Fault;
};

function makeHarness(faults: Faults = {}) {
  const runtimeLog: string[] = [];
  const storageLog: string[] = [];
  const counts = new Map<RuntimeKey, number>();
  const insertResults: { inserted: boolean }[] = [];
  const timeline = new Map<string, Parameters<RecordFormationEventRuntime["appendGlobalTimeline"]>[0]>();
  let timelineAttempts = 0;

  const events = new MemoryTable("events", storageLog, faults.eventWrite);
  const profiles = new MemoryTable("profiles", storageLog, faults.profileWrite);
  const known = new Set<unknown>([asTableClient(events), asTableClient(profiles)]);

  function note(key: RuntimeKey, label: string): void {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    runtimeLog.push(label);
  }

  function requireSynthetic(table: TableClient): void {
    assert.ok(known.has(table), "runtime received a non-synthetic table");
  }

  const runtime: RecordFormationEventRuntime = {
    getFormationEventsTableClient: connectionString => {
      assert.equal(connectionString, CONNECTION);
      note("getFormationEventsTableClient", "getEventsTable");
      return asTableClient(events);
    },
    getFormationProfilesTableClient: connectionString => {
      assert.equal(connectionString, CONNECTION);
      note("getFormationProfilesTableClient", "getProfilesTable");
      return asTableClient(profiles);
    },
    ensureTableExists: async client => {
      requireSynthetic(client);
      note("ensureTableExists", `ensureTable:${client.tableName}`);
      await ensureTableExists(client);
    },
    getFormationProfile: async (table, visitorId) => {
      requireSynthetic(table);
      note("getFormationProfile", "getProfile");
      return getFormationProfile(table, visitorId);
    },
    insertFormationEvent: async (table, entity) => {
      requireSynthetic(table);
      note("insertFormationEvent", "insertEvent");
      const result = await insertFormationEvent(table, entity);
      insertResults.push(result);
      return result;
    },
    appendGlobalTimeline: async item => {
      note("appendGlobalTimeline", "appendTimeline");
      timelineAttempts++;
      if (faults.timeline === "before") {
        throw new Error("synthetic_timeline_pre_write_failure");
      }
      if (!timeline.has(item.eventId)) timeline.set(item.eventId, item);
      if (faults.timeline === "after") {
        throw new Error("synthetic_timeline_lost_acknowledgement");
      }
    },
    upsertFormationProfile: async (table, entity) => {
      requireSynthetic(table);
      note("upsertFormationProfile", "upsertProfile");
      await upsertFormationProfile(table, entity);
    }
  };

  return {
    runtime,
    runtimeLog,
    storageLog,
    counts,
    insertResults,
    timeline,
    events,
    profiles,
    get timelineAttempts() {
      return timelineAttempts;
    }
  };
}

type Harness = ReturnType<typeof makeHarness>;

function makeInput(overrides: Partial<FormationEventInput> = {}): FormationEventInput {
  return {
    visitorId: VISITOR,
    type: FormationEventType.SERVICE_ATTENDED,
    occurredAt: OCCURRED_AT,
    channel: "service",
    idempotencyKey: EVENT_ID,
    ...overrides
  };
}

function profileRow(h: Harness): Row | undefined {
  return h.profiles.rows.get(`VISITOR|${VISITOR}`);
}

const FULL_ORDER = [
  "getEventsTable",
  "getProfilesTable",
  "ensureTable:events",
  "ensureTable:profiles",
  "getProfile",
  "insertEvent",
  "appendTimeline",
  "upsertProfile"
];

async function run(): Promise<void> {
  // Replace the import-time environment-dependent storage module before loading the recorder.
  const tableClientPath = require.resolve("../../src/storage/tableClient");
  const originalTableClientModule = require.cache[tableClientPath];
  let realStorageUses = 0;
  require.cache[tableClientPath] = {
    id: tableClientPath,
    filename: tableClientPath,
    loaded: true,
    exports: {
      getTableClient: async (): Promise<never> => {
        realStorageUses++;
        throw new Error("real getTableClient must never be used");
      }
    },
    children: [],
    paths: []
  } as unknown as NodeJS.Module;

  const originalFromConnectionString = TableClient.fromConnectionString;
  let realClientConstructions = 0;
  (TableClient as unknown as { fromConnectionString: () => never }).fromConnectionString =
    () => {
      realClientConstructions++;
      throw new Error("real TableClient construction must never happen");
    };

  const originalConsoleError = console.error;
  const consoleErrors: unknown[][] = [];
  console.error = (...args: unknown[]): void => {
    consoleErrors.push(args);
  };

  try {
    const { recordFormationEvent } = require("../../src/domain/formation/recordFormationEvent") as Recorder;
    assert.equal(
      require.cache[tableClientPath]?.exports.getTableClient !== undefined,
      true
    );

    const call = (h: Harness, input: FormationEventInput = makeInput()) =>
      recordFormationEvent(input, {
        storageConnectionString: CONNECTION,
        runtime: h.runtime
      });

    const scenarios: [string, () => Promise<void>][] = [];
    const scenario = (name: string, fn: () => Promise<void>) =>
      scenarios.push([name, fn]);

    scenario("1. success: event -> timeline -> profile, every injected operation exercised", async () => {
      const h = makeHarness();
      const result = await call(h);

      assert.equal(result.eventRowKey, ROW_KEY);
      assert.deepEqual(h.runtimeLog, FULL_ORDER);

      // Real repository helpers ran against in-memory tables (lower-level order incl. duplicate check).
      assert.deepEqual(h.storageLog, [
        "events.createTable",
        "profiles.createTable",
        "profiles.getEntity",
        "events.listEntities",
        "events.createEntity",
        "profiles.upsertEntity"
      ]);
      assert.deepEqual(h.events.listFilters, [DUPLICATE_FILTER]);

      for (const key of RUNTIME_KEYS) {
        assert.ok((h.counts.get(key) ?? 0) >= 1, `runtime member not exercised: ${key}`);
      }
      assert.equal(h.counts.get("ensureTableExists"), 2);
      assert.deepEqual(h.insertResults, [{ inserted: true }]);

      assert.equal(h.events.rows.size, 1);
      const event = h.events.rows.get(`${VISITOR}|${ROW_KEY}`);
      assert.equal(event?.id, EVENT_ID);
      assert.equal(event?.type, FormationEventType.SERVICE_ATTENDED);

      assert.equal(h.timeline.size, 1);
      const entry = h.timeline.get(EVENT_ID);
      assert.equal(entry?.stream, "formation");
      assert.equal(entry?.visitorId, VISITOR);
      assert.equal(entry?.type, FormationEventType.SERVICE_ATTENDED);
      assert.equal(entry?.occurredAt, OCCURRED_AT);
      assert.deepEqual(entry?.raw, event);

      const profile = profileRow(h) as FormationProfileEntity | undefined;
      assert.ok(profile);
      assert.equal(profile.partitionKey, "VISITOR");
      assert.equal(profile.rowKey, VISITOR);
      assert.equal(profile.lastEventType, FormationEventType.SERVICE_ATTENDED);
      assert.equal(profile.lastEventAt, OCCURRED_AT);
      assert.equal(profile.lastEventId, EVENT_ID);
      assert.equal(profile.lastServiceAttendedAt, OCCURRED_AT);
      assert.deepEqual(h.profiles.upsertModes, ["Replace"]);
      assert.equal(consoleErrors.length, 0);
    });

    scenario("2. validation failure happens before any injected operation", async () => {
      const h = makeHarness();
      await assert.rejects(
        call(h, makeInput({ visitorId: "" })),
        (err: Error & { statusCode?: number }) =>
          err.statusCode === 400 && /visitorId required/.test(err.message)
      );
      assert.deepEqual(h.runtimeLog, []);
      assert.deepEqual(h.storageLog, []);
    });

    scenario("3. failure before event persistence leaves no event, timeline or profile", async () => {
      const h = makeHarness({ eventWrite: "before" });
      await assert.rejects(call(h), /synthetic_event_pre_write_failure/);

      assert.equal(h.events.createAttempts, 1);
      assert.equal(h.events.rows.size, 0);
      assert.equal(h.timeline.size, 0);
      assert.equal(h.profiles.rows.size, 0);
      assert.deepEqual(h.runtimeLog, FULL_ORDER.slice(0, 6));
      assert.equal(h.counts.get("appendGlobalTimeline"), undefined);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);
      assert.equal(h.insertResults.length, 0);
    });

    scenario("4. event persisted but insert acknowledgement lost: partial state, no timeline/profile", async () => {
      const h = makeHarness({ eventWrite: "after" });
      await assert.rejects(call(h), /synthetic_event_lost_acknowledgement/);

      assert.equal(h.events.createAttempts, 1);
      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 0);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.counts.get("appendGlobalTimeline"), undefined);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);
    });

    scenario("5. event persisted, failure before timeline append: partial state, no retry, not repaired", async () => {
      const h = makeHarness({ timeline: "before" });
      await assert.rejects(
        call(h),
        /^Error: globalTimeline append failed: synthetic_timeline_pre_write_failure$/
      );

      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 0);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.timelineAttempts, 1);
      assert.equal(h.events.createAttempts, 1);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);
      assert.deepEqual(h.runtimeLog, FULL_ORDER.slice(0, 7));
      assert.equal(consoleErrors.length, 1);
      assert.equal(consoleErrors[0][0], "globalTimeline append failed");

      // Caller retry with same key: duplicate early return; nothing is repaired.
      const retry = await call(h);
      assert.equal(retry.eventRowKey, ROW_KEY);
      assert.equal(h.events.createAttempts, 1);
      assert.equal(h.timelineAttempts, 1);
      assert.equal(h.timeline.size, 0);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);
      assert.equal(retry.profile.lastEventType, undefined);
    });

    scenario("6. lost acknowledgement after timeline persistence: ambiguous, timeline present, profile absent", async () => {
      const h = makeHarness({ timeline: "after" });
      await assert.rejects(
        call(h),
        /^Error: globalTimeline append failed: synthetic_timeline_lost_acknowledgement$/
      );

      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 1);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.timelineAttempts, 1);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);

      // Same surface error shape as a definite pre-write failure; only storage inspection distinguishes them.
      const retry = await call(h);
      assert.equal(retry.eventRowKey, ROW_KEY);
      assert.equal(h.timelineAttempts, 1);
      assert.equal(h.timeline.size, 1);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.counts.get("upsertFormationProfile"), undefined);
    });

    scenario("7. profile failure before write: definite, event+timeline persisted, profile absent, no retry", async () => {
      const h = makeHarness({ profileWrite: "before" });
      await assert.rejects(call(h), /synthetic_profile_pre_write_failure/);

      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 1);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.profiles.upsertAttempts, 1);
      assert.equal(h.counts.get("upsertFormationProfile"), 1);
      assert.deepEqual(h.runtimeLog, FULL_ORDER);

      // Retry: duplicate early return does not repair the missing projection.
      const retry = await call(h);
      assert.equal(retry.eventRowKey, ROW_KEY);
      assert.equal(h.profiles.upsertAttempts, 1);
      assert.equal(h.profiles.rows.size, 0);
      assert.equal(h.timelineAttempts, 1);
      assert.equal(retry.profile.lastEventType, undefined);
    });

    scenario("8. profile failure after write: ambiguous, profile persisted although call rejects, no retry", async () => {
      const h = makeHarness({ profileWrite: "after" });
      await assert.rejects(call(h), /synthetic_profile_lost_acknowledgement/);

      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 1);
      assert.equal(h.profiles.upsertAttempts, 1);
      assert.equal(h.profiles.rows.size, 1);
      const profile = profileRow(h);
      assert.equal(profile?.lastEventType, FormationEventType.SERVICE_ATTENDED);
      assert.equal(profile?.lastEventId, EVENT_ID);

      // Retry: duplicate early return, no second write; existing profile is returned as stored.
      const retry = await call(h);
      assert.equal(retry.eventRowKey, ROW_KEY);
      assert.equal(h.profiles.upsertAttempts, 1);
      assert.equal(retry.profile.lastEventId, EVENT_ID);
    });

    scenario("9. duplicate event early return after full success: no further writes", async () => {
      const h = makeHarness();
      const first = await call(h);
      const before = {
        events: h.events.createAttempts,
        timeline: h.timelineAttempts,
        upserts: h.profiles.upsertAttempts
      };
      h.runtimeLog.length = 0;

      const second = await call(h);

      assert.equal(second.eventRowKey, first.eventRowKey);
      assert.equal(h.events.createAttempts, before.events);
      assert.equal(h.timelineAttempts, before.timeline);
      assert.equal(h.profiles.upsertAttempts, before.upserts);
      assert.equal(h.events.listFilters.length, 2);
      assert.deepEqual(h.runtimeLog, [
        "getEventsTable",
        "getProfilesTable",
        "ensureTable:events",
        "ensureTable:profiles",
        "getProfile"
      ]);
      assert.equal(second.profile.lastEventId, EVENT_ID);
    });

    scenario("10. no idempotency key: no duplicate lookup, generated event id", async () => {
      const h = makeHarness();
      const result = await call(h, makeInput({ idempotencyKey: undefined }));

      assert.deepEqual(h.events.listFilters, []);
      assert.match(
        result.eventRowKey,
        /^2030-01-01T00:00:00\.000Z__[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      assert.equal(h.events.rows.size, 1);
      assert.equal(h.timeline.size, 1);
      assert.equal(profileRow(h)?.lastEventType, FormationEventType.SERVICE_ATTENDED);
    });

    scenario("11. insert conflict (inserted:false) is ignored: recorder still appends timeline and writes profile", async () => {
      const h = makeHarness();
      // Same keys as the new event, but a different id so the duplicate lookup does not match.
      h.events.seed({
        partitionKey: VISITOR,
        rowKey: ROW_KEY,
        id: "synthetic-preexisting-id",
        visitorId: VISITOR,
        type: FormationEventType.SERVICE_ATTENDED,
        occurredAt: OCCURRED_AT
      });

      const result = await call(h);

      assert.equal(result.eventRowKey, ROW_KEY);
      assert.deepEqual(h.insertResults, [{ inserted: false }]);
      assert.equal(h.events.createAttempts, 1);
      assert.equal(h.events.rows.size, 1);
      assert.equal(
        h.events.rows.get(`${VISITOR}|${ROW_KEY}`)?.id,
        "synthetic-preexisting-id"
      );
      assert.equal(h.timeline.size, 1);
      assert.equal(h.profiles.rows.size, 1);
      assert.deepEqual(h.runtimeLog, FULL_ORDER);
    });

    for (const [name, fn] of scenarios) {
      consoleErrors.length = 0;
      await fn();
      console.log(`PASS ${name}`);
    }

    assert.equal(realStorageUses, 0, "real global timeline storage must never be touched");
    assert.equal(realClientConstructions, 0, "real TableClient must never be constructed");

    console.log("Formation event runtime failure characterization assertions passed.");
  } finally {
    console.error = originalConsoleError;
    TableClient.fromConnectionString = originalFromConnectionString;
    if (originalTableClientModule) {
      require.cache[tableClientPath] = originalTableClientModule;
    } else {
      delete require.cache[tableClientPath];
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
