import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { health } from "../../src/functions/health";
import { version } from "../../src/functions/version";

type FunctionName = "health" | "version";

function verifyBinding(name: FunctionName): void {
  const path = join(
    __dirname,
    "../../src/functions",
    name,
    "function.json"
  );

  const config = JSON.parse(readFileSync(path, "utf8"));
  const triggers = config.bindings.filter(
    (binding: any) => binding.type === "httpTrigger"
  );

  assert.equal(triggers.length, 1, `${name}: one HTTP trigger required`);

  assert.equal(triggers[0].authLevel, "anonymous");
  assert.deepEqual(triggers[0].methods, ["get"]);
  assert.equal(triggers[0].route, name);
}

async function verifyHandler(
  name: FunctionName,
  handler: (context: any, request: any) => Promise<void>,
  expectedBody: Record<string, unknown>
): Promise<void> {
  const context: any = { res: undefined };

  const syntheticMarker = "SYNTHETIC_SECRET_NEVER_ECHO";

  const request = {
    method: "GET",
    headers: {
      "x-api-key": syntheticMarker,
      authorization: `Bearer ${syntheticMarker}`
    },
    query: {
      secret: syntheticMarker
    },
    body: {
      configuration: syntheticMarker
    }
  };

  await handler(context, request);

  assert.ok(context.res, `${name}: response required`);
  assert.equal(context.res.status, 200);

  assert.deepEqual(context.res.headers, {
    "content-type": "application/json; charset=utf-8"
  });

  assert.deepEqual(context.res.body, expectedBody);

  const serialized = JSON.stringify(context.res);

  assert.equal(
    serialized.includes(syntheticMarker),
    false,
    `${name}: request secrets must not appear in response`
  );
}

async function run(): Promise<void> {
  verifyBinding("health");
  verifyBinding("version");

  await verifyHandler("health", health, {
    ok: true
  });

  await verifyHandler("version", version, {
    ok: true,
    service: "hope-ai-api",
    version: "1.0.0"
  });

  console.log("publicHealthVersionHttpContract.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
