import assert from "node:assert/strict";
import { getMorningBriefing } from "../../src/functions/getMorningBriefing";

const originalFeature = process.env.FEATURE_MORNING_BRIEFING;
const originalApiKey = process.env.HOPE_API_KEY;

async function run(): Promise<void> {
  process.env.FEATURE_MORNING_BRIEFING = "false";
  process.env.HOPE_API_KEY = "test-api-key";

  const context: any = { log: { error: () => undefined } };
  await getMorningBriefing(context, {
    headers: { "x-api-key": "test-api-key" }
  });

  assert.equal(context.res.status, 404);
  assert.equal(context.res.body.code, "MORNING_BRIEFING_DISABLED");

  if (originalFeature === undefined) delete process.env.FEATURE_MORNING_BRIEFING;
  else process.env.FEATURE_MORNING_BRIEFING = originalFeature;

  if (originalApiKey === undefined) delete process.env.HOPE_API_KEY;
  else process.env.HOPE_API_KEY = originalApiKey;

  console.log("morningBriefingFunction.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});