import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { runPrivateConnectivityRunner } from
  "./private-connectivity-runner.mjs";

const runner = fileURLToPath(
  new URL("./private-connectivity-runner.mjs", import.meta.url)
);

test("runner always denies in-process invocation", async () => {
  const result = await runPrivateConnectivityRunner();

  assert.deepEqual(result, {
    status: "AUTHORIZATION_UNAVAILABLE"
  });
  assert.equal(Object.isFrozen(result), true);
});

test("CLI flags and claimed authorization cannot execute", () => {
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "--execute",
      "--approved",
      "--enable"
    ],
    {
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        ENABLE_PROBE: "true",
        EXECUTE: "true",
        APPROVED: "true"
      }
    }
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 78);
  assert.equal(
    result.stdout,
    "AUTHORIZATION_UNAVAILABLE\n"
  );
  assert.equal(result.stderr, "");
});