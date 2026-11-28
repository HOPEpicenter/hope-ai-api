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

import {
  postPermanentPublicVisitSession as sessionEndpoint
} from "../src/functions/postPermanentPublicVisitSession";

// Synthetic credential only. No Azure credential or
// network access is used by these configuration tests.
const syntheticKey = Buffer.alloc(64, 7).toString("base64");

const productionConnection =
  "DefaultEndpointsProtocol=https;" +
  "AccountName=hopeproddatafbafd6e4;" +
  `AccountKey=${syntheticKey};` +
  "EndpointSuffix=core.windows.net";

const production: NodeJS.ProcessEnv = {
  FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "true",
  FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT: "false",
  FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY: "true",
  FEATURE_PERMANENT_VISITOR_CONSENT_GUARD: "true",
  WEBSITE_SITE_NAME: "hope-ai-api-prod",
  WEBSITE_RESOURCE_GROUP: "rg-hope-ai-api-prod",
  WEBSITE_SLOT_NAME: "Production",
  HOPE_TABLE_AUTH_MODE: "connection-string",
  HOPE_TABLE_ENDPOINT: undefined,
  HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID: undefined,
  STORAGE_CONNECTION_STRING: productionConnection,
  HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER:
    "2020-01-01T00:00:00.000Z"
};

test("production requires explicit activation and exact consent authority", () => {
  assert.equal(permitted(production), true);

  for (const changes of [
    { FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: undefined },
    { FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "false" },
    { FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "TRUE" },
    { FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY: "false" },
    { FEATURE_PERMANENT_VISITOR_CONSENT_GUARD: "false" },
    { FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT: "true" },
    { WEBSITE_SITE_NAME: "synthetic-wrong-app" },
    { WEBSITE_RESOURCE_GROUP: "synthetic-wrong-group" },
    { WEBSITE_SLOT_NAME: "staging" },
    { HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER: undefined },
    { HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER: "invalid" },
    { HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER:
        "9999-01-01T00:00:00.000Z" }
  ]) {
    assert.equal(permitted({
      ...production, ...changes
    }), false);
  }

  assert.equal(permitted({
    WEBSITE_SITE_NAME: "hope-ai-api-prod",
    WEBSITE_RESOURCE_GROUP: "rg-hope-ai-api-prod"
  }), false);

  assert.equal(permitted({
    ...valid,
    FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "true"
  }), false);

  assert.equal(permitted(valid), true);

  console.log("PRODUCTION_DEFAULT_OFF_BOUNDARY_VERIFIED=True");
  console.log("PRODUCTION_LEGACY_FALLBACK_DENIED=True");
  console.log("ISOLATED_ACTIVATION_PRESERVED=True");
});

test("production requires its exact canonical operational storage configuration", () => {
  assert.equal(permitted(production), true);

  assert.equal(permitted({
    ...production,
    STORAGE_CONNECTION_STRING: productionConnection +
      ";TableEndpoint=https://hopeproddatafbafd6e4.table.core.windows.net/"
  }), true);

  for (const changes of [
    { STORAGE_CONNECTION_STRING: undefined },
    { STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true" },
    { STORAGE_CONNECTION_STRING:
        productionConnection.replace(
          "hopeproddatafbafd6e4",
          "sthopekiad20261122"
        ) },
    { STORAGE_CONNECTION_STRING:
        productionConnection.replace(
          "DefaultEndpointsProtocol=https",
          "DefaultEndpointsProtocol=http"
        ) },
    { STORAGE_CONNECTION_STRING:
        productionConnection.replace(
          "core.windows.net", "example.invalid"
        ) },
    { STORAGE_CONNECTION_STRING:
        productionConnection +
        ";TableEndpoint=https://sthopekiad20261122.table.core.windows.net" },
    { STORAGE_CONNECTION_STRING:
        productionConnection +
        ";AccountName=sthopekiad20261122" },
    { STORAGE_CONNECTION_STRING:
        productionConnection.replace(
          syntheticKey, "invalid-key"
        ) },
    { HOPE_TABLE_AUTH_MODE: "managed-identity" },
    { HOPE_TABLE_ENDPOINT:
        "https://sthopekiad20261122.table.core.windows.net" },
    { HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID:
        "11111111-1111-1111-1111-111111111111" }
  ]) {
    assert.equal(permitted({
      ...production, ...changes
    }), false);
  }

  console.log("CANONICAL_PRODUCTION_STORAGE_CONTRACT_VERIFIED=True");
  console.log("ALTERNATE_STORAGE_AND_AUTHENTICATION_DENIED=True");
});

test("session issuance shares the production activation boundary", async () => {
  const settings: NodeJS.ProcessEnv = {
    ...production,
    FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "false",
    FEATURE_PERMANENT_PUBLIC_VISIT: "true",
    FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET: "true",
    FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP: "true",
    FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION: "true",
    FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION: "true"
  };

  const previous = Object.fromEntries(
    Object.keys(settings).map(key => [
      key, process.env[key]
    ])
  );

  let accesses = 0;

  try {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    const session: Parameters<typeof sessionEndpoint>[0] = {};
    const registration: Parameters<typeof publicEndpoint>[0] = {};
    const recovery: { res?: { status: number } } = {};

    await sessionEndpoint(session, {
      method: "POST"
    }, {
      reserveRequest: async () => {
        accesses++;
        throw Error("Unexpected session budget access");
      }
    });

    await publicEndpoint(registration, {
      method: "POST"
    }, {
      runtime: async () => {
        accesses++;
        throw Error("Unexpected registration runtime");
      }
    });

    await recoveryEndpoint(recovery, {
      method: "POST"
    }, {
      readStaff: async () => {
        accesses++;
        throw Error("Unexpected Staff lookup");
      }
    });

    assert.equal(session.res?.status, 503);
    assert.equal(registration.res?.status, 503);
    assert.equal(recovery.res?.status, 503);
    assert.equal(accesses, 0);

    console.log("ALL_THREE_ACTIVATION_BOUNDARIES_VERIFIED=True");
    console.log("DISABLED_PRODUCTION_DENIED_BEFORE_STORAGE=True");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("canonical production accepts standard Azure service endpoints and default storage mode", () => {
  const account = "hopeproddatafbafd6e4";

  const blob =
    `https://${account}.blob.core.windows.net/`;

  const queue =
    `https://${account}.queue.core.windows.net/`;

  const file =
    `https://${account}.file.core.windows.net/`;

  const table =
    `https://${account}.table.core.windows.net/`;

  const fullConnection =
    productionConnection +
    `;BlobEndpoint=${blob}` +
    `;QueueEndpoint=${queue}` +
    `;FileEndpoint=${file}` +
    `;TableEndpoint=${table}`;

  for (const mode of [
    undefined, "", "connection-string"
  ]) {
    assert.equal(permitted({
      ...production,
      HOPE_TABLE_AUTH_MODE: mode,
      STORAGE_CONNECTION_STRING: fullConnection
    }), true);
  }

  console.log("STANDARD_AZURE_ENDPOINTS_ACCEPTED=True");
  console.log("EXISTING_DEFAULT_STORAGE_MODE_ACCEPTED=True");

  for (const [original, service] of [
    [blob, "blob"],
    [queue, "queue"],
    [file, "file"],
    [table, "table"]
  ]) {
    for (const replacement of [
      original.replace("https:", "http:"),
      original.replace(account, "sthopekiad20261122"),
      original.replace(account, "syntheticwrongaccount"),
      `https://${account}.${service}.example.invalid/`,
      original + "unexpected-path",
      original + "?unexpected=value",
      original + "#unexpected",
      original.replace(".net/", ".net:8443/")
    ]) {
      assert.equal(permitted({
        ...production,
        STORAGE_CONNECTION_STRING:
          fullConnection.replace(original, replacement)
      }), false);
    }
  }

  assert.equal(permitted({
    ...production,
    STORAGE_CONNECTION_STRING:
      fullConnection + `;BlobEndpoint=${blob}`
  }), false);

  assert.equal(permitted({
    ...production,
    STORAGE_CONNECTION_STRING:
      fullConnection + ";UnknownField=synthetic"
  }), false);

  assert.equal(permitted({
    ...production,
    HOPE_TABLE_AUTH_MODE: "managed-identity",
    STORAGE_CONNECTION_STRING: fullConnection
  }), false);

  assert.equal(permitted({
    ...production,
    FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION: "false",
    STORAGE_CONNECTION_STRING: fullConnection
  }), false);

  console.log("ALTERNATE_SERVICE_ENDPOINTS_DENIED=True");
  console.log("DUPLICATE_AND_UNKNOWN_FIELDS_DENIED=True");
  console.log("PRODUCTION_DEFAULT_OFF_PRESERVED=True");
});
