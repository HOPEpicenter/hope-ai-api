import assert from "node:assert/strict";
import { getFeatureFlags } from "../../src/config/featureFlags";

const original = process.env.FEATURE_MORNING_BRIEFING;

delete process.env.FEATURE_MORNING_BRIEFING;
assert.equal(getFeatureFlags().morningBriefing, false);

process.env.FEATURE_MORNING_BRIEFING = "true";
assert.equal(getFeatureFlags().morningBriefing, true);

process.env.FEATURE_MORNING_BRIEFING = "false";
assert.equal(getFeatureFlags().morningBriefing, false);

if (original === undefined) delete process.env.FEATURE_MORNING_BRIEFING;
else process.env.FEATURE_MORNING_BRIEFING = original;

console.log("morningBriefingFeatureFlag.test.ts passed");