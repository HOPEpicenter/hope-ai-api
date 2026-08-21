import assert from "node:assert/strict";
import { getFeatureFlags } from "../../src/config/featureFlags";

const original = process.env.FEATURE_PHASE4_AGGREGATION;

process.env.FEATURE_PHASE4_AGGREGATION = "true";
assert.equal(getFeatureFlags().phase4Aggregation, true);

process.env.FEATURE_PHASE4_AGGREGATION = "false";
assert.equal(getFeatureFlags().phase4Aggregation, false);

if (original === undefined) delete process.env.FEATURE_PHASE4_AGGREGATION;
else process.env.FEATURE_PHASE4_AGGREGATION = original;

console.log("phase4FeatureFlag.test.ts passed");