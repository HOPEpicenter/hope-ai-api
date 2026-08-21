import assert from "node:assert/strict";
import { handlePhase4AggregationRead } from "../../src/functions/_shared/phase4Aggregation";

async function run(): Promise<void> {
  const originalFeature = process.env.FEATURE_PHASE4_AGGREGATION;
  const originalApiKey = process.env.HOPE_API_KEY;

  process.env.FEATURE_PHASE4_AGGREGATION = "false";
  process.env.HOPE_API_KEY = "test-api-key";

  const context: any = { log: { error: () => undefined } };
  const req: any = {
    params: { id: "visitor-1" },
    headers: { "x-api-key": "test-api-key" }
  };

  await handlePhase4AggregationRead(context, req, aggregate => ({ aggregate }));

  assert.equal(context.res.status, 503);
  assert.equal(context.res.body.ok, false);
  assert.equal(context.res.body.error.code, "PHASE4_AGGREGATION_DISABLED");

  if (originalFeature === undefined) delete process.env.FEATURE_PHASE4_AGGREGATION;
  else process.env.FEATURE_PHASE4_AGGREGATION = originalFeature;

  if (originalApiKey === undefined) delete process.env.HOPE_API_KEY;
  else process.env.HOPE_API_KEY = originalApiKey;

  console.log("phase4FunctionDisabled.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});