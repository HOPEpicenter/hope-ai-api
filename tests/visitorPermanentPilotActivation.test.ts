import { test } from "node:test";
import assert from "node:assert/strict";

import {
  permanentVisitorActivationPermitted as permitted
} from "../src/services/visitors/permanentVisitorPilotActivation";

import {
  postPermanentPublicVisitRegistration as publicEndpoint
} from "../src/functions/postPermanentPublicVisitRegistration";

import {
  postPermanentVisitReconciliation as recoveryEndpoint
} from "../src/functions/postPermanentVisitReconciliation";

const valid = {
  FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT: "true",
  FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY: "true",
  WEBSITE_SITE_NAME: "hope-kiosk-acceptance-api",
  WEBSITE_RESOURCE_GROUP: "rg-hope-kiosk-acceptance-20261122",
  HOPE_TABLE_AUTH_MODE: "managed-identity",
  HOPE_TABLE_ENDPOINT:
    "https://sthopekiad20261122.table.core.windows.net/",
  HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER:
    "2026-11-24T00:00:00.000Z"
};

test("default-off preserves existing non-authority behavior", () => {
  assert.equal(permitted({}), true);

  assert.equal(permitted({
    FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY: "true"
  }), false);
});

test("exact isolated pilot configuration passes boundary", () => {
  assert.equal(permitted(valid), true);

  console.log("EXACT_ISOLATED_BOUNDARY_VERIFIED=True");
});

test("pilot cannot fall back to legacy consent mode", () => {
  assert.equal(permitted({
    ...valid,
    FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY: "false"
  }), false);
});

test("authority remains blocked unless pilot explicitly enabled", () => {
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    assert.equal(permitted({
      ...valid,
      FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT: flag
    }), false);
  }
});

test("wrong application or resource group fails closed", () => {
  assert.equal(permitted({
    ...valid,
    WEBSITE_SITE_NAME: "synthetic-production"
  }), false);

  assert.equal(permitted({
    ...valid,
    WEBSITE_RESOURCE_GROUP: "synthetic-production"
  }), false);

  assert.equal(permitted({
    ...valid,
    WEBSITE_SITE_NAME: undefined
  }), false);
});

test("wrong storage and alternate connection settings are denied", () => {
  for (const changes of [
    { HOPE_TABLE_ENDPOINT: "https://other.table.core.windows.net/" },
    { HOPE_TABLE_ENDPOINT: valid.HOPE_TABLE_ENDPOINT + "?override=1" },
    { HOPE_TABLE_AUTH_MODE: "connection-string" },
    { STORAGE_CONNECTION_STRING: "synthetic-override" },
    { AzureWebJobsStorage: "synthetic-host-override" }
  ]) {
    assert.equal(permitted({
      ...valid, ...changes
    }), false);
  }
});

test("missing or malformed consent cutover is denied", () => {
  for (const cutover of [undefined, "", "invalid", "2026-11-24"]) {
    assert.equal(permitted({
      ...valid,
      HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER: cutover
    }), false);
  }
});

test("both endpoints reject non-pilot authority before runtime access", async () => {
  const settings = {
    ...valid,
    WEBSITE_SITE_NAME: "synthetic-non-pilot",
    FEATURE_PERMANENT_PUBLIC_VISIT: "true",
    FEATURE_PERMANENT_VISITOR_CONSENT_GUARD: "true",
    FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP: "true",
    FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION: "true",
    FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION: "true"
  };

  const previous = new Map(
    Object.keys(settings).map(
      key => [key, process.env[key]] as const
    )
  );

  let runtimeCalls = 0;
  let staffReads = 0;

  try {
    Object.assign(process.env, settings);

    const pub: Parameters<typeof publicEndpoint>[0] = {};
    const admin: { res?: { status: number } } = {};

    await publicEndpoint(pub, { method: "POST" }, {
      runtime: async () => {
        runtimeCalls++;
        throw Error("Unexpected runtime access");
      }
    });

    await recoveryEndpoint(admin, { method: "POST" }, {
      readStaff: async () => {
        staffReads++;
        throw Error("Unexpected Staff access");
      }
    });

    assert.equal(pub.res?.status, 503);
    assert.equal(admin.res?.status, 503);
    assert.equal(runtimeCalls, 0);
    assert.equal(staffReads, 0);

    console.log("BOTH_NON_PILOT_ENDPOINTS_DENIED=True");
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
