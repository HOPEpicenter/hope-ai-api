import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../src/contracts/formationEventEvidenceAcquisition.v1";
import type { AuthenticatedStaffActionDecision } from "../../src/services/authorization/authorizeAuthenticatedStaffAction";
import { inspectFormationEventWithAdminDecision } from "../../src/services/formation/inspectFormationEventWithAdminDecision";
import { FormationEventEvidenceReadPort } from "../../src/services/formation/readFormationEventAcquisition";
import { makeDeterministicFormationEventRowKey } from "../../src/domain/formation/formationEventRowKey";

const VISITOR = "synthetic-admin-visitor-001";
const EVENT_ID = "synthetic-admin-event-100";
const STAFF_ID = "synthetic-canonical-admin-001";
const AT = "2030-01-01T00:00:00.000Z";
const ROW_KEY = makeDeterministicFormationEventRowKey(AT, EVENT_ID);

function identity(overrides: Record<string, unknown> = {}): FormationEventEvidenceAcquisitionIdentityV1 {
  return { visitorId: VISITOR, eventId: EVENT_ID, occurredAt: AT, ...overrides } as FormationEventEvidenceAcquisitionIdentityV1;
}

function acceptedDecision(
  overrides: Record<string, unknown> = {}
): AuthenticatedStaffActionDecision {
  return {
    allowed: true,
    authenticatedStaffId: STAFF_ID,
    action: "system.admin",
    ...overrides
  } as AuthenticatedStaffActionDecision;
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
  decision: unknown,
  enabled: unknown,
  readPort: unknown
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  const result = await inspectFormationEventWithAdminDecision(
    identityValue as FormationEventEvidenceAcquisitionIdentityV1,
    decision as AuthenticatedStaffActionDecision,
    enabled as boolean,
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
  await test("accepted synthetic admin decision and enabled inspection perform one read", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      acceptedDecision(),
      true,
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "matching_evidence");
    assert.equal(calls, 1);
  });

  await test("matching FormationEvent returns advisory matching evidence", async () => {
    const result = await inspect(identity(), acceptedDecision(), true, port(async () => record()));
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.reasonCode, "record_matches_trusted_identity");
    assert.equal(result.candidateRowKey, ROW_KEY);
  });

  await test("explicitly disabled enablement produces zero reads", async () => {
    let calls = 0;
    const result = await inspect(identity(), acceptedDecision(), false, port(async () => { calls++; return record(); }));
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("missing, null, and non-Boolean enablement fail closed", async () => {
    for (const enabled of [undefined, null, 0, "true", {}, false]) {
      let calls = 0;
      const result = await inspect(identity(), acceptedDecision(), enabled, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("denied decisions produce zero reads", async () => {
    const reasons = [
      "unsupported_action",
      "authentication_failed",
      "actor_mismatch",
      "staff_identity_unavailable",
      "staff_binding_mismatch",
      "administrator_configuration_missing",
      "insufficient_authority"
    ] as const;
    for (const reason of reasons) {
      let calls = 0;
      const result = await inspect(
        identity(),
        { allowed: false, reason },
        true,
        port(async () => { calls++; return record(); })
      );
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("missing, null, malformed, and contradictory decisions produce zero reads", async () => {
    const malformed: unknown[] = [
      undefined,
      null,
      false,
      {},
      { allowed: true, authenticatedStaffId: STAFF_ID, action: "system.admin", reason: "insufficient_authority" },
      { allowed: false, reason: "insufficient_authority", authenticatedStaffId: STAFF_ID },
      { allowed: "true", authenticatedStaffId: STAFF_ID, action: "system.admin" },
      { allowed: false, reason: "insufficient_authority", contradictory: true }
    ];
    for (const decision of malformed) {
      let calls = 0;
      const result = await inspect(identity(), decision, true, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("missing or blank authenticated staff ID produces zero reads", async () => {
    for (const staffId of [undefined, "", "   "]) {
      let calls = 0;
      const decision = staffId === undefined
        ? { allowed: true, action: "system.admin" }
        : acceptedDecision({ authenticatedStaffId: staffId });
      const result = await inspect(identity(), decision, true, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("untrimmed authenticated staff ID produces zero reads", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      acceptedDecision({ authenticatedStaffId: ` ${STAFF_ID}` }),
      true,
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("unsupported action and extra decision fields produce zero reads", async () => {
    for (const decision of [
      acceptedDecision({ action: "staff.admin" }),
      { ...acceptedDecision(), extra: true }
    ]) {
      let calls = 0;
      const result = await inspect(identity(), decision, true, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("inherited properties, accessors, proxies, arrays, and hostile objects fail closed", async () => {
    const inherited = Object.create({ authenticatedStaffId: STAFF_ID });
    Object.assign(inherited, { allowed: true, action: "system.admin" });
    const accessor = {
      allowed: true,
      action: "system.admin",
      get authenticatedStaffId(): string {
        throw new Error("synthetic hostile decision getter");
      }
    };
    const hostileProxy = new Proxy(acceptedDecision(), {
      ownKeys(): never {
        throw new Error("synthetic hostile decision proxy");
      }
    });
    for (const decision of [inherited, accessor, hostileProxy, [], new Date()]) {
      let calls = 0;
      const result = await inspect(identity(), decision, true, port(async () => { calls++; return record(); }));
      assert.equal(result.status, "unavailable");
      assert.equal(calls, 0);
    }
  });

  await test("matching stored record cannot override denied authorization", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      { allowed: false, reason: "insufficient_authority" },
      true,
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 0);
  });

  await test("authorized explicit EntityNotFound 404 remains non-historical absence", async () => {
    const result = await inspect(
      identity(),
      acceptedDecision(),
      true,
      port(async () => { throw { statusCode: 404, code: "EntityNotFound" }; })
    );
    assert.equal(result.status, "observed_absence");
    assert.equal(result.reasonCode, "absence_observed_not_historical");
    assert.equal(result.historicalAbsenceEstablished, false);
  });

  await test("TableNotFound and conflicting storage errors remain unavailable", async () => {
    for (const error of [
      { statusCode: 404, code: "TableNotFound" },
      { statusCode: 404, code: "EntityNotFound", response: { error: { code: "InternalError" } } }
    ]) {
      const result = await inspect(identity(), acceptedDecision(), true, port(async () => { throw error; }));
      assert.equal(result.status, "unavailable");
    }
  });

  await test("invalid FormationEvent identity produces zero reads", async () => {
    let calls = 0;
    const result = await inspect(
      identity({ occurredAt: "invalid" }),
      acceptedDecision(),
      true,
      port(async () => { calls++; return record(); })
    );
    assert.equal(result.status, "ambiguous");
    assert.equal(calls, 0);
  });

  await test("decision mutation during asynchronous read cannot change result or safety flags", async () => {
    const mutableDecision = acceptedDecision() as unknown as {
      allowed: boolean;
      authenticatedStaffId: string;
      action: string;
    };
    const result = await inspect(
      identity(),
      mutableDecision,
      true,
      port(async () => {
        mutableDecision.allowed = false;
        mutableDecision.authenticatedStaffId = "";
        mutableDecision.action = "not.admin";
        await Promise.resolve();
        return record();
      })
    );
    assert.equal(result.status, "matching_evidence");
    assert.equal(result.authoritative, false);
    assert.equal(result.retryAuthorized, false);
  });

  await test("reader exception does not trigger a retry", async () => {
    let calls = 0;
    const result = await inspect(
      identity(),
      acceptedDecision(),
      true,
      port(async () => { calls++; throw new Error("synthetic read failure"); })
    );
    assert.equal(result.status, "unavailable");
    assert.equal(calls, 1);
  });

  await test("invalid injected read port fails closed", async () => {
    const result = await inspect(identity(), acceptedDecision(), true, {});
    assert.equal(result.status, "unavailable");
    assert.equal(result.reasonCode, "observation_unavailable");
  });

  await test("source is synthetic-only and has no production access dependencies", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/services/formation/inspectFormationEventWithAdminDecision.ts"),
      "utf8"
    );
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
    assert.deepEqual(imports, [
      "util",
      "../../contracts/formationEventEvidenceAcquisition.v1",
      "../../domain/formation/assessFormationEventAcquisition",
      "../authorization/authorizeAuthenticatedStaffAction",
      "./readFormationEventAcquisition",
      "./inspectTrustedFormationEventEvidence"
    ]);
    assert.match(source, /SYNTHETIC-ONLY, NOT AN AUTHENTICATION BOUNDARY/);
    assert.match(source, /token-verifying, canonical-staff-checking/);
    assert.doesNotMatch(source, /@azure|process\.env|\bfetch\s*\(|https?:\/\/|connectionString|bearer|apiKey|administratorStaffIds|recordFormationEvent|createEntity|upsertEntity|deleteEntity/);
  });

  console.log(`FormationEvent admin-decision adapter assertions passed (${passed} tests).`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
