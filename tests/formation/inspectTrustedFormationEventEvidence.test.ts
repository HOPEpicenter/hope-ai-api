import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import {
  inspectTrustedFormationEventEvidence,
  TrustedFormationEventEvidenceContext
} from "../../src/services/formation/inspectTrustedFormationEventEvidence";
import { FormationEventEvidenceReadPort } from "../../src/services/formation/readFormationEventAcquisition";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";

const VISITOR = "synthetic-trusted-visitor-001";
const EVENT_ID = "synthetic-trusted-event-100";
const AT = "2030-01-01T00:00:00.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(AT, EVENT_ID);
const STORAGE_MODEL = "current_formation_events_writer_v1";

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT, ...overrides } as FormationEventEvidenceAcquisitionIdentityV1;
}

function context(
  overrides: Record<string, unknown> = {}
): TrustedFormationEventEvidenceContext {
  return {
    storageModel: STORAGE_MODEL,
    evidenceInspectionEnabled: true,
    staffAuthorized: true,
    authorizationEstablishedByTrustedInfrastructure: true,
    ...overrides
  } as TrustedFormationEventEvidenceContext;
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

async function inspect(
  identityValue: unknown,
  contextValue: unknown,
  readPort: unknown
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const result = await inspectTrustedFormationEventEvidence(
    identityValue as FormationEventEvidenceAcquisitionIdentityV1,
    contextValue as TrustedFormationEventEvidenceContext,
    readPort as FormationEventEvidenceReadPort
  );
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
  await test("fully authorized synthetic context delegates exactly one read", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      context(),
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
    assert.equal(calls, 1);
  });

  await test("matching production-shaped event returns matching advisory evidence", async () => {
    const result = await inspect(identity(), context(), port(async () => record()));
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.candidateRowKey, ROW_KEY);
  });

  await test("feature disabled denies inspection without reading", async () => {
    let calls = 0;
    const result = await inspect(identity(), context({ evidenceInspectionEnabled: false }), port(async () => { calls++; return record(); }));
    assert.equal(result.status, "unavailable");
    assert.equal(result.reasonCode, "observation_unavailable");
    assert.equal(calls, 0);
  });

  await test("staff authorization denied blocks matching evidence", async () => {
    let calls = 0;
    const result = await inspect(identity(), context({ staffAuthorized: false }), port(async () => { calls++; return record(); }));
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("trusted-infrastructure determination missing denies without reading", async () => {
    let calls = 0;
    const missingDetermination = context();
    delete (missingDetermination as unknown as Record<string, unknown>).authorizationEstablishedByTrustedInfrastructure;
    const result = await inspect(identity(), missingDetermination, port(async () => { calls++; return record(); }));
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("invalid storage model denies without reading", async () => {
    let calls = 0;
    const result = await inspect(identity(), context({ storageModel: "legacy_repository" }), port(async () => { calls++; return record(); }));
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("missing, null, and malformed contexts deny without reading", async () => {
    for (const contextValue of [undefined, null, false, "trusted", 42]) {
      let calls = 0;
      const result = await inspect(identity(), contextValue, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(result.reasonCode, "observation_unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("unexpected context properties fail closed", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      { ...context(), credentials: "synthetic-not-a-credential" },
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("context accessors, hostile getters, and proxies fail closed", async () => {
    let calls = 0;
    const accessorContext = {
      ...context(),
      get staffAuthorized(): boolean {
        throw new Error("synthetic hostile context getter");
      }
    };
    const getterResult = await inspect(identity(), accessorContext, port(async () => { calls++; return record(); }));
    assert.equal(getterResult.status, "unavailable");

    const proxyContext = new Proxy(context(), {
      ownKeys(): never {
        throw new Error("synthetic hostile context proxy");
      }
    });
    const proxyResult = await inspect(identity(), proxyContext, port(async () => { calls++; return record(); }));
    assert.equal(proxyResult.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("matching evidence never overrides denied context", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      context({ staffAuthorized: false }),
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("authorized explicit EntityNotFound 404 remains non-historical observed absence", async () => {
    const result = await inspect(
      identity(),
      context(),
      port(async () => { throw { statusCode: 404, code: "EntityNotFound" }; })
    );
    assert.equal(result.status, "observed_absence");
    assert.equal(result.reasonCode, "absence_observed_not_historical");
    assert.equal(result.historicalAbsenceEstablished, false);
  });

  await test("TableNotFound, conflicting storage errors, and unknown failures remain unavailable", async () => {
    const failures: unknown[] = [
      { statusCode: 404, code: "TableNotFound" },
      { statusCode: 404, code: "EntityNotFound", response: { parsedBody: { error: { code: "AuthenticationFailed" } } } },
      { statusCode: 500, code: "InternalError" }
    ];
    for (const failure of failures) {
      const result = await inspect(identity(), context(), port(async () => { throw failure; }));
      assert.equal(result.status, "unavailable");
      assert.equal(result.reasonCode, "observation_unavailable");
    }
  });

  await test("invalid FormationEvent identities produce zero reads", async () => {
    const invalidIdentities: unknown[] = [
      { visitorId: "", eventId: EVENT_ID, occurredAt: AT },
      { visitorId: VISITOR, eventId: " ", occurredAt: AT },
      { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: "invalid" },
      null
    ];
    for (const identityValue of invalidIdentities) {
      let calls = 0;
      const result = await inspect(identityValue, context(), port(async () => { calls++; return record(); }));
      assert.equal(result.status, "ambiguous");
      assert.equal(calls, 0);
    }
  });

  await test("context mutation during asynchronous read cannot change authorization or safety", async () => {
    const mutableContext = context() as unknown as Record<string, unknown>;
    const result = await inspect(
      identity(),
      mutableContext,
      port(async () => {
        mutableContext.evidenceInspectionEnabled = false;
        mutableContext.staffAuthorized = false;
        mutableContext.authorizationEstablishedByTrustedInfrastructure = false;
        mutableContext.storageModel = "legacy_repository";
        await Promise.resolve();
        return record();
      })
    );
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
  });

  await test("reader failures do not trigger retries", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      context(),
      port(async () => { calls++; throw new Error("synthetic read failure"); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 1);
  });

  await test("invalid injected read port fails closed", async () => {
    const result = await inspect(identity(), context(), {});
    assert.equal(result.status, "unavailable");
    assert.equal(result.reasonCode, "observation_unavailable");
  });

  await test("source contains no storage, endpoint, credential, or environment dependencies", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/services/formation/inspectTrustedFormationEventEvidence.ts"),
      "utf8"
    );
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(imports, [
      "util",
      "../../contracts/formationEventEvidenceAcquisition.v1",
      "../../domain/formation/assessFormationEventAcquisition",
      "./readFormationEventAcquisition"
    ]);
    assert.doesNotMatch(source, /@azure|process\.env|\bfetch\s*\(|https?:\/\/|connectionString|bearer|apiKey|recordFormationEvent|createEntity|upsertEntity|deleteEntity/);
    assert.match(source, /future production caller[\s\S]*canonical staff-identity infrastructure/);
  });

  console.log(`Trusted FormationEvent evidence boundary assertions passed (${passed} tests).`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
