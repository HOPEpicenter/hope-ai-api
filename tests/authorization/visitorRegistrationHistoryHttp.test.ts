import { strict as assert } from "node:assert";
import { test, before, after } from "node:test";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
type HistoryHandler =
  typeof import("../../src/functions/getVisitorRegistrationHistory")
    .getVisitorRegistrationHistory;

let handle: HistoryHandler;

const storageSettings: Record<string, string | undefined> = {
  HOPE_TABLE_AUTH_MODE: "connection-string",
  STORAGE_CONNECTION_STRING:
    "DefaultEndpointsProtocol=http;" +
    "AccountName=hopevisitor100;" +
    "AccountKey=" + Buffer.alloc(64, 1).toString("base64") + ";" +
    "TableEndpoint=http://127.0.0.1:1/hopevisitor100;",
  AzureWebJobsStorage:
    "DefaultEndpointsProtocol=http;" +
    "AccountName=hopevisitor100;" +
    "AccountKey=" + Buffer.alloc(64, 1).toString("base64") + ";" +
    "TableEndpoint=http://127.0.0.1:1/hopevisitor100;",
  HOPE_TABLE_ENDPOINT: undefined,
  HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID: undefined
};

const previousStorageSettings = new Map<
  string, string | undefined
>();

function restoreStorageSettings(): void {
  for (const [name, value] of previousStorageSettings) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

before(async () => {
  for (const [name, value] of Object.entries(storageSettings)) {
    previousStorageSettings.set(name, process.env[name]);

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    // Initialize SDK clients only with synthetic settings.
    // All test requests inject their staff, history and
    // consent readers. No actual storage is required.
    const module = await import(
      "../../src/functions/getVisitorRegistrationHistory"
    );

    handle = module.getVisitorRegistrationHistory;
  } catch (error) {
    restoreStorageSettings();
    throw error;
  }

  console.log("SYNTHETIC_TEST_INITIALIZATION_VERIFIED=True");
});

after(() => {
  restoreStorageSettings();
});
import type { VisitorRegistrationFamilyHistoryResult } from "../../src/services/visitors/readCanonicalVisitorRegistrationFamilyHistory";

type Deps = NonNullable<Parameters<typeof handle>[2]>;
const flag = "FEATURE_PERMANENT_VISITOR_REGISTRATION_HISTORY";
const id = "synthetic-visitor-100";
const key = "synthetic-staff-api-key-100";
const actor = "synthetic-staff-100";
const stamp = "2026-11-24T19:00:00.000Z";
const staff = (roleLabel: string, status: "active" | "inactive" = "active"): CanonicalStaffIdentity => ({
  staffId: actor, displayName: "Synthetic Staff", roleLabel, status,
  createdAt: stamp, updatedAt: stamp, lastEventId: "synthetic-event",
  entraTenantId: null, entraObjectId: null, email: null, phone: null, ministryAreaId: null
});
const sample: VisitorRegistrationFamilyHistoryResult = {
  status: "ready", registrationCount: 1, truncated: false,
  items: [{
    submissionId: "11111111-1111-4111-8111-111111111111", serviceId: "visit-2026-11-24",
    recordedAt: stamp, visitType: "first", churchHome: "looking", interests: ["prayer"],
    invitedBy: null, contactConsentAtRegistration: true,
    familyAttendance: { status: "recorded", recordedAt: stamp, childCount: 1,
      children: [{ firstName: "Synthetic Child", ageGroup: "6-11" }],
      purpose: "general_church_attendance", relationshipStatus: "guardian_declared_unverified" }
  }]
};
function fixture(overrides: Deps = {}) {
  const calls = { staff: 0, history: 0, consent: 0 };
  const deps: Deps = {
    readStaff: async value => { calls.staff++; assert.equal(value, actor); return staff("Care Team"); },
    readHistory: async value => { calls.history++; assert.equal(value, id); return sample; },
    readConsent: async value => { calls.consent++; assert.equal(value, id); return "declined"; },
    ...overrides
  };
  return { calls, deps };
}
function request(headers: Record<string, string> = { "x-api-key": key, "x-hope-staff-actor-id": actor }, visitorId = id, method = "GET") {
  return { headers, params: { id: visitorId }, method };
}
async function run(req: ReturnType<typeof request>, deps: Deps, enabled: string | null = "true") {
  const oldFlag = process.env[flag], oldKey = process.env.HOPE_API_KEY;
  try {
    if (enabled === null) delete process.env[flag]; else process.env[flag] = enabled;
    process.env.HOPE_API_KEY = key;
    const context: any = {};
    await handle(context, req, deps);
    assert.equal(context.res.headers["cache-control"], "no-store");
    return context.res;
  } finally {
    if (oldFlag === undefined) delete process.env[flag]; else process.env[flag] = oldFlag;
    if (oldKey === undefined) delete process.env.HOPE_API_KEY; else process.env.HOPE_API_KEY = oldKey;
  }
}
test("history feature disabled denies before staff or storage", async () => {
  for (const value of [null, "", "false", "TRUE"]) {
    const f = fixture();
    assert.equal((await run(request(), f.deps, value)).status, 404);
    assert.deepEqual(f.calls, { staff: 0, history: 0, consent: 0 });
  }
});
test("missing invalid and public bridge credentials cannot read history", async () => {
  const credentials: Record<string, string>[] = [{}, {"x-api-key":"invalid"}, {"x-hope-public-visit-key":key}];
  for (const headers of credentials) {
    const f = fixture();
    assert.equal((await run(request(headers), f.deps)).status, 401);
    assert.deepEqual(f.calls, { staff: 0, history: 0, consent: 0 });
  }
});
test("missing unknown or inactive staff are denied before visitor reads", async () => {
  const missing = fixture();
  assert.equal((await run(request({"x-api-key": key}), missing.deps)).status, 401);
  assert.deepEqual(missing.calls, { staff: 0, history: 0, consent: 0 });
  for (const identity of [null, staff("Pastor", "inactive")]) {
    const f = fixture({ readStaff: async () => identity });
    assert.equal((await run(request(), f.deps)).status, 403);
    assert.equal(f.calls.history + f.calls.consent, 0);
  }
});
test("invalid method or visitor ID does not reach history storage", async () => {
  const f = fixture();
  assert.equal((await run(request(undefined, id, "POST"), f.deps)).status, 405);
  assert.equal((await run(request(undefined, "invalid'visitor"), f.deps)).status, 400);
  assert.equal(f.calls.history + f.calls.consent, 0);
});
test("active ordinary staff receive attendance counts without child identifiers", async () => {
  const f = fixture();
  const result = await run(request(), f.deps);
  assert.equal(result.status, 200);
  assert.equal(result.body.visitorId, id);
  assert.equal(result.body.childDetailsVisible, false);
  assert.equal(result.body.currentConsent, "declined");
  assert.equal(result.body.history.items[0].contactConsentAtRegistration, true);
  assert.equal(result.body.history.items[0].familyAttendance.childCount, 1);
  assert.equal("children" in result.body.history.items[0].familyAttendance, false);
  assert.equal(JSON.stringify(result.body).includes("Synthetic Child"), false);
  assert.deepEqual(f.calls, { staff: 1, history: 1, consent: 1 });
});
test("existing pastoral roles receive only validated child attendance fields", async () => {
  for (const role of ["Pastor", "Ministry Leader"]) {
    const f = fixture({ readStaff: async () => staff(role) });
    const result = await run(request(), f.deps);
    assert.equal(result.status, 200);
    assert.equal(result.body.childDetailsVisible, true);
    assert.deepEqual(result.body.history.items[0].familyAttendance.children, [{firstName:"Synthetic Child", ageGroup:"6-11"}]);
    assert.equal(JSON.stringify(result.body).includes("fingerprint"), false);
  }
});
test("unknown current consent remains explicitly unavailable and does not inherit history", async () => {
  const f = fixture({ readConsent: async () => "unavailable" });
  const result = await run(request(), f.deps);
  assert.equal(result.status, 200);
  assert.equal(result.body.currentConsent, "unavailable");
  assert.equal(result.body.history.items[0].contactConsentAtRegistration, true);
});
test("storage and authorization failures return generic unavailable without partial history", async () => {
  for (const overrides of [
    {readStaff: async () => { throw new Error("synthetic-sensitive-error"); }},
    {readHistory: async () => ({status:"unavailable" as const})},
    {readConsent: async () => { throw new Error("synthetic-sensitive-error"); }}
  ] as Deps[]) {
    const f = fixture(overrides);
    const result = await run(request(), f.deps);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {ok:false,error:"REGISTRATION_HISTORY_UNAVAILABLE"});
  }
});
