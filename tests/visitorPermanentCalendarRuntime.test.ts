import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import { postPermanentPublicVisitSession as issue } from "../src/functions/postPermanentPublicVisitSession";
import { postPermanentPublicVisitRegistration as submit } from "../src/functions/postPermanentPublicVisitRegistration";
import { listApprovedVisitorEvents } from "../src/services/visitors/listApprovedVisitorEvents";

const bridge = "synthetic-calendar-acceptance-bridge-secret";
const headers = { "content-type": "application/json", "x-hope-public-visit-key": bridge };
let calendar: TableClient;
let visitors: TableClient;
function isolatedTable(name: string): TableClient {
  const connection = process.env.STORAGE_CONNECTION_STRING ?? "";
  const port = process.env.HOPE_VISITOR_72_ISOLATED_PORT ?? "";
  assert.equal(process.env.HOPE_VISITOR_72_LOCAL_RUNTIME, "true");
  assert.match(port, /^\d{1,5}$/);
  assert.ok(Number(port) > 0 && Number(port) <= 65535 && Number(port) !== 10002);
  assert.equal(process.env.HOPE_TABLE_AUTH_MODE, "connection-string");
  assert.equal(process.env.AzureWebJobsStorage, connection);
  const endpoint = `http://127.0.0.1:${port}/hopevisitor72`;
  const parts = connection.split(";");
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.slice(0, 2), ["DefaultEndpointsProtocol=http", "AccountName=hopevisitor72"]);
  assert.match(parts[2], /^AccountKey=[A-Za-z0-9+/]+={0,2}$/);
  assert.deepEqual(parts.slice(3), [`TableEndpoint=${endpoint}`, `BlobEndpoint=${endpoint}`, `QueueEndpoint=${endpoint}`]);
  const table = TableClient.fromConnectionString(connection, name, { allowInsecureConnection: true });
  const url = new URL(table.url);
  assert.equal(url.origin, `http://127.0.0.1:${port}`);
  assert.equal(url.pathname.replace(/\/$/, ""), "/hopevisitor72");
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  return table;
}
before(async () => {
  // Validate every client before provisioning any table. VisitorEvents is deliberately absent initially.
  const tables = ["Visitors", "VisitorFollowupEvents", "PermanentVisitorAdmission", "PermanentVisitorSessionQuota", "VisitorEvents"].map(isolatedTable);
  visitors = tables[0]; calendar = tables[4];
  for (const table of tables.slice(0, 4)) await table.createTable();
  Object.assign(process.env, {
    FEATURE_PERMANENT_PUBLIC_VISIT: "true", FEATURE_PERMANENT_VISITOR_CONSENT_GUARD: "true",
    FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP: "true", FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET: "true",
    HOPE_PERMANENT_VISIT_BRIDGE_KEY: bridge, HOPE_PERMANENT_VISIT_SESSION_SECRET: "synthetic-calendar-session-signing-secret", HOPE_PERMANENT_VISIT_CLAIM_SECRET: "synthetic-calendar-claim-fingerprint-secret"
  });
});
const clock = (instant: string) => ({ now: () => Date.parse(instant) });
async function session(instant: string, body: unknown = {}) {
  const context: Parameters<typeof issue>[0] = {};
  await issue(context, { method: "POST", headers, body }, clock(instant));
  assert.ok(context.res); assert.equal(context.res.headers["cache-control"], "no-store");
  return context.res;
}
function tokenOf(response: Awaited<ReturnType<typeof session>>) {
  assert.equal(response.status, 200); assert.equal(response.body.status, "ready");
  const token = response.body.token; assert.equal(typeof token, "string"); assert.ok(token);
  return token as string;
}
function submission(token: string, eventId?: string) {
  const submissionId = randomUUID();
  return { token, submissionId, body: { name: "Synthetic Calendar Visitor", email: `${submissionId}@example.invalid`, visitType: "first", contactConsent: false, ...(eventId ? {eventId} : {}) } };
}
async function register(instant: string, body: unknown) {
  const context: Parameters<typeof submit>[0] = {};
  await submit(context, { method: "POST", headers, body }, clock(instant));
  assert.ok(context.res); assert.equal(context.res.headers["cache-control"], "no-store");
  return context.res;
}
async function recorded(instant: string, request: ReturnType<typeof submission>, serviceId: string) {
  const result = await register(instant, request);
  assert.equal(result.status, 200, `registration status ${String(result.body.status)}`);
  assert.deepEqual(result.body, { status: "recorded", accepted: true });
  const receipt = await visitors.getEntity<{serviceId: string}>("VISITOR_CHECK_IN", request.submissionId);
  assert.equal(receipt.serviceId, serviceId);
}
async function noReceipt(id: string) {
  await assert.rejects(visitors.getEntity("VISITOR_CHECK_IN", id), (e: unknown) => (e as {statusCode?: number}).statusCode === 404);
}
async function add(id: string, date: string, name: string, active: boolean | string, partitionKey = "directory") {
  await calendar.createEntity({ partitionKey, rowKey: id, date, name, active });
}

test("missing calendar table fails closed rather than issuing General Visit", async () => {
  const now = "2026-11-24T19:00:00Z";
  await assert.rejects(listApprovedVisitorEvents("2026-11-24"));
  const result = await session(now);
  assert.equal(result.status, 503); assert.equal("token" in result.body, false);
  await calendar.createTable();
});
test("real empty applicable calendar uses Eastern date and excludes inactive or unrelated rows", async () => {
  const now = "2026-11-25T02:00:00Z"; // Nov 24 in New York
  await add("inactive-24", "2026-11-24", "Inactive event", false);
  await add("other-date", "2026-11-25", "Other day", true);
  await add("wrong-partition", "2026-11-24", "Unapproved source", true, "not-directory");
  const result = await session(now);
  const token = tokenOf(result);
  assert.deepEqual(result.body.event, {serviceId: "visit-2026-11-24", date: "2026-11-24", name: "General Visit"});
  await recorded(now, submission(token), "visit-2026-11-24");
});
test("one persisted approved event automatically selected and stored on attendance receipt", async () => {
  const now = "2026-11-26T19:00:00Z";
  await add("approved-26", "2026-11-26", "Synthetic approved service", true);
  const result = await session(now);
  const token = tokenOf(result);
  assert.deepEqual(result.body.event, {serviceId: "approved-26", date: "2026-11-26", name: "Synthetic approved service"});
  await recorded(now, submission(token), "approved-26");
});
test("multiple persisted approved events require choice and session cannot authorize another event", async () => {
  const now = "2026-11-27T19:00:00Z";
  await add("approved-27-a", "2026-11-27", "Synthetic service A", true);
  await add("approved-27-b", "2026-11-27", "Synthetic service B", true);
  const choices = await session(now);
  assert.equal(choices.status, 409); assert.equal(choices.body.status, "selection_required");
  assert.equal("token" in choices.body, false); assert.equal(choices.body.date, "2026-11-27");
  assert.ok(Array.isArray(choices.body.events));
  assert.deepEqual(choices.body.events.map((e: {serviceId: string}) => e.serviceId).sort(), ["approved-27-a", "approved-27-b"]);
  const selected = await session(now, {eventId: "approved-27-b"});
  const token = tokenOf(selected);
  const wrong = submission(token, "approved-27-a");
  assert.equal((await register(now, wrong)).status, 403); await noReceipt(wrong.submissionId);
  await recorded(now, submission(token, "approved-27-b"), "approved-27-b");
});
test("malformed persisted calendar evidence blocks both session and registration without attendance write", async () => {
  const now = "2026-11-28T19:00:00Z";
  const valid = tokenOf(await session(now));
  await add("malformed-28", "2026-11-28", "Synthetic malformed event", "true");
  await assert.rejects(listApprovedVisitorEvents("2026-11-28"));
  const unavailable = await session(now);
  assert.equal(unavailable.status, 503); assert.equal("token" in unavailable.body, false);
  const attempt = submission(valid);
  const result = await register(now, attempt);
  assert.equal(result.status, 503); assert.notEqual(result.body.accepted, true); await noReceipt(attempt.submissionId);
});
