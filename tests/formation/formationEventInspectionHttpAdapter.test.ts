import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import {
  FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1
} from "../../src/services/formation/formationEventProductionReadBoundaryContract";
import type {
  AuthenticatedStaffActionDecision
} from "../../src/services/authorization/authorizeAuthenticatedStaffAction";

const FEATURE_SETTING = "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION";
const VISITOR_ID = "synthetic-http-visitor";
const EVENT_ID = "synthetic-http-event";
const OCCURRED_AT = "2030-07-08T09:10:11.000Z";
const TOKEN = "synthetic.header.token";
const AUTHORIZATION_PATH = require.resolve(
  "../../src/services/authorization/authorizeAuthenticatedStaffAction"
);
const READ_ONLY_BOUNDARY_PATH = require.resolve(
  "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary"
);
const READER_FACTORY_PATH = require.resolve(
  "../../src/services/formation/createFormationEventV1BackendReadPort"
);
const COMPOSITION_PATH = require.resolve(
  "../../src/services/formation/inspectFormationEventWithAuthorizedBackendReader"
);
const TABLE_CLIENT_PATH = require.resolve("@azure/data-tables");

type AuthorizationFunction = typeof import("../../src/services/authorization/authorizeAuthenticatedStaffAction")
  .authorizeAuthenticatedStaffAction;
type AdapterFunction = typeof import("../../src/functions/_shared/formationEventInspectionHttpAdapter")
  .handleFormationEventInspectionHttpRequest;
type NodeModule = typeof import("module");

const nodeModule = require("module") as NodeModule;

function request(
  options: {
    readonly method?: string;
    readonly body?: unknown;
    readonly jsonError?: Error;
    readonly authorization?: string | null;
    readonly rawHeaders?: readonly string[];
  } = {}
): HttpRequest {
  const headers = new Headers();
  if (options.authorization !== null) {
    headers.set("authorization", options.authorization ?? `Bearer ${TOKEN}`);
  }
  const rawHeaders = options.rawHeaders;
  const value: Record<string, unknown> = {
    method: options.method ?? "POST",
    headers,
    json: async () => {
      if (options.jsonError) throw options.jsonError;
      return Object.prototype.hasOwnProperty.call(options, "body")
        ? options.body
        : {
        visitorId: VISITOR_ID,
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT
        };
    }
  };
  if (rawHeaders) value.rawHeaders = [...rawHeaders];
  return value as unknown as HttpRequest;
}

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    [FEATURE_SETTING]: "true",
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
    HOPE_ENTRA_TENANT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    HOPE_ENTRA_API_AUDIENCE: "api://synthetic-http-adapter",
    AUTH_MICROSOFT_ENTRA_ID_ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
    HOPE_ENTRA_REQUIRED_ROLES: "",
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    HOPE_ADMIN_STAFF_IDS: "synthetic-http-admin",
    ...overrides
  };
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

function installAuthorization(
  decision: AuthenticatedStaffActionDecision | Error
): {
  readonly restore: () => void;
  readonly calls: () => number;
  readonly args: () => readonly unknown[][];
} {
  const previous = require.cache[AUTHORIZATION_PATH];
  const syntheticModule = new nodeModule.Module(AUTHORIZATION_PATH);
  syntheticModule.filename = AUTHORIZATION_PATH;
  syntheticModule.loaded = true;
  let calls = 0;
  const args: unknown[][] = [];
  const authorize = (async (...values: Parameters<AuthorizationFunction>) => {
    calls++;
    args.push(values);
    if (decision instanceof Error) throw decision;
    return decision;
  }) as AuthorizationFunction;
  syntheticModule.exports = { authorizeAuthenticatedStaffAction: authorize };
  require.cache[AUTHORIZATION_PATH] = syntheticModule;

  return {
    restore: () => {
      if (previous) require.cache[AUTHORIZATION_PATH] = previous;
      else delete require.cache[AUTHORIZATION_PATH];
    },
    calls: () => calls,
    args: () => args.map(value => [...value])
  };
}

function loadAdapter(): AdapterFunction {
  const adapterPath = require.resolve(
    "../../src/functions/_shared/formationEventInspectionHttpAdapter"
  );
  delete require.cache[adapterPath];
  return (
    require(adapterPath) as {
      handleFormationEventInspectionHttpRequest: AdapterFunction;
    }
  ).handleFormationEventInspectionHttpRequest;
}

function assertFixedResponse(
  result: HttpResponseInit,
  expectedStatus: number,
  expectedError: string
): void {
  assert.equal(result.status, expectedStatus);
  assert.deepEqual(result.jsonBody, { ok: false, error: expectedError });
  assert.deepEqual(result.headers, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const restoreEnvironment = setEnvironment(environment());
  const adapter = loadAdapter();
  try {
    await test("adapter rejects non-POST methods without parsing or authorizing", async () => {
      const authorization = installAuthorization(new Error("authorization must not run"));
      try {
        const result = await adapter(request({ method: "GET" }));
        assertFixedResponse(result, 405, "Method not allowed");
        assert.equal(authorization.calls(), 0);
      } finally {
        authorization.restore();
      }
    });

    await test("malformed body and identity return fixed errors without authorization", async () => {
      const authorization = installAuthorization(new Error("authorization must not run"));
      try {
        for (const item of [
          request({ jsonError: new Error("sensitive parse failure") }),
          request({ body: null }),
          request({ body: [] }),
          request({ body: { visitorId: VISITOR_ID, eventId: EVENT_ID, occurredAt: "bad" } }),
          request({ body: {
            visitorId: VISITOR_ID,
            eventId: EVENT_ID,
            occurredAt: OCCURRED_AT,
            extra: "unexpected"
          } })
        ]) {
          assertFixedResponse(await adapter(item), 400, "Invalid request");
        }
        assert.equal(authorization.calls(), 0);
      } finally {
        authorization.restore();
      }
    });

    await test("missing malformed duplicate and conflicting bearer headers fail closed", async () => {
      const authorization = installAuthorization(new Error("authorization must not run"));
      try {
        const cases = [
          request({ authorization: null }),
          request({ authorization: "Basic synthetic" }),
          request({ authorization: `Bearer ${TOKEN}, Bearer ${TOKEN}` }),
          request({
            rawHeaders: [
              "authorization", `Bearer ${TOKEN}`,
              "Authorization", "Bearer other.synthetic.token"
            ]
          }),
          request({
            authorization: `Bearer ${TOKEN}`,
            rawHeaders: ["authorization", "Bearer other.synthetic.token"]
          })
        ];
        for (const item of cases) {
          assertFixedResponse(await adapter(item), 401, "Unauthorized");
        }
        assert.equal(authorization.calls(), 0);
      } finally {
        authorization.restore();
      }
    });

    await test("default-off or malformed feature configuration never authorizes", async () => {
      const authorization = installAuthorization(new Error("authorization must not run"));
      try {
        for (const setting of [undefined, "false", "enabled"]) {
          const restoreCase = setEnvironment(environment({
            [FEATURE_SETTING]: setting
          }));
          try {
            assertFixedResponse(
              await adapter(request()),
              503,
              "FormationEvent inspection is unavailable"
            );
          } finally {
            restoreCase();
          }
        }
        assert.equal(authorization.calls(), 0);
      } finally {
        authorization.restore();
      }
    });

    await test("blocked boundary prevents authorization, reader construction, and storage access", async () => {
      const authorization = installAuthorization({
        allowed: false,
        reason: "insufficient_authority"
      });
      try {
        assertFixedResponse(
          await adapter(request()),
          503,
          "FormationEvent inspection is unavailable"
        );
        assert.equal(authorization.calls(), 0);
        assert.equal(
          (require.cache[READ_ONLY_BOUNDARY_PATH]?.exports as {
            FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY: boolean;
          }).FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY,
          false
        );
        assert.equal(require.cache[READER_FACTORY_PATH], undefined);
        assert.equal(require.cache[COMPOSITION_PATH], undefined);
        assert.equal(require.cache[TABLE_CLIENT_PATH], undefined);
      } finally {
        authorization.restore();
      }
    });

    await test("valid request remains blocked before authorization while credential isolation is unavailable", async () => {
      const authorization = installAuthorization({
        allowed: true,
        authenticatedStaffId: "synthetic-http-admin",
        action: "system.admin"
      });
      try {
        const result = await adapter(request());
        assertFixedResponse(
          result,
          503,
          "FormationEvent inspection is unavailable"
        );
        assert.equal(authorization.calls(), 0);
        assert.equal(require.cache[READER_FACTORY_PATH], undefined);
        assert.equal(require.cache[COMPOSITION_PATH], undefined);
        assert.equal(require.cache[TABLE_CLIENT_PATH], undefined);
      } finally {
        authorization.restore();
      }
    });

    await test("fixed error responses never echo raw token or request exceptions", async () => {
      const authorization = installAuthorization(
        new Error(`synthetic-secret ${TOKEN} synthetic-http-admin`)
      );
      try {
        const result = await adapter(request({
          jsonError: new Error(`synthetic-parse-secret ${TOKEN}`)
        }));
        assertFixedResponse(result, 400, "Invalid request");
        const serialized = JSON.stringify(result);
        for (const secret of [
          TOKEN,
          "synthetic-http-admin",
          "synthetic-secret",
          "synthetic-parse-secret"
        ]) {
          assert.equal(serialized.includes(secret), false);
        }
        assert.equal(authorization.calls(), 0);
      } finally {
        authorization.restore();
      }
    });

    await test("adapter source is dormant and never invokes the shared-credential reader", () => {
      const sourcePath = path.resolve(
        __dirname,
        "../../src/functions/_shared/formationEventInspectionHttpAdapter.ts"
      );
      const source = fs.readFileSync(sourcePath, "utf8");
      assert.doesNotMatch(source, /inspectFormationEventWithAuthorizedBackendReader/);
      assert.doesNotMatch(source, /createFormationEventV1BackendReadPort/);
      assert.doesNotMatch(source, /app\.http|app\.timer|app\.storage/);
      assert.match(source, /FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY/);
      assert.equal(
        FORMATION_EVENT_PRODUCTION_READ_BOUNDARY_CONTRACT_V1.productionBoundaryImplemented,
        false
      );
    });

    console.log(`Passed ${passed} FormationEvent inspection HTTP adapter tests.`);
  } finally {
    restoreEnvironment();
    delete require.cache[require.resolve(
      "../../src/functions/_shared/formationEventInspectionHttpAdapter"
    )];
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
