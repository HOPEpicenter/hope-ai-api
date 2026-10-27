import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  makeDeterministicFormationEventRowKey,
  makeFormationEventRowKey
} from "../../src/domain/formation/formationEventRowKey";

// Synthetic values only. The helper import above needs no Azure configuration.

const AT = "2030-01-01T00:00:00.000Z";

// Exact timestamp + event id, millisecond precision, determinism.
assert.equal(makeFormationEventRowKey(AT, "synthetic-event-001"), `${AT}__synthetic-event-001`);
assert.equal(
  makeFormationEventRowKey("2030-01-01T00:00:00.123Z", "e"),
  "2030-01-01T00:00:00.123Z__e"
);
assert.equal(
  makeDeterministicFormationEventRowKey(AT, "synthetic-event-001"),
  makeFormationEventRowKey(AT, "synthetic-event-001")
);
assert.equal(
  makeDeterministicFormationEventRowKey(AT, "x"),
  makeDeterministicFormationEventRowKey(AT, "x")
);

// Trimming of supplied ids (inner whitespace preserved).
assert.equal(makeFormationEventRowKey(AT, "  id-1 \t"), `${AT}__id-1`);
assert.equal(makeDeterministicFormationEventRowKey(AT, "  id-1 \t"), `${AT}__id-1`);
assert.equal(makeFormationEventRowKey(AT, " a b "), `${AT}__a b`);

// Timestamp strings are preserved verbatim (no normalization).
for (const raw of ["2030-01-01T00:00:00Z", "2030-01-01", "not-a-date", "", " 2030 "]) {
  assert.equal(makeFormationEventRowKey(raw, "e"), `${raw}__e`);
  assert.equal(makeDeterministicFormationEventRowKey(raw, "e"), `${raw}__e`);
}

// Deterministic-only mode rejects missing or blank ids and never falls back to randomness.
for (const bad of [undefined, null, "", "   ", "\t\n"]) {
  assert.throws(
    () => makeDeterministicFormationEventRowKey(AT, bad as unknown as string),
    /eventId is required/
  );
}

// Writer fallback: 12-character hex suffix, independently generated per call.
const HEX_KEY = new RegExp(`^${AT.replace(/\./g, "\\.")}__[0-9a-f]{12}$`);
const generated = new Set<string>();
for (const blank of [undefined, "", "   "]) {
  const key = makeFormationEventRowKey(AT, blank);
  assert.match(key, HEX_KEY);
  generated.add(key);
}
for (let i = 0; i < 20; i++) {
  const key = makeFormationEventRowKey(AT);
  assert.match(key, HEX_KEY);
  generated.add(key);
}
// Collision impossibility is not assumed; only that generation is not a constant.
assert.ok(generated.size > 1);

// Source guards.
const recorder = fs.readFileSync(
  path.resolve(process.cwd(), "src/domain/formation/recordFormationEvent.ts"),
  "utf8"
);
assert.ok(recorder.includes('import { makeFormationEventRowKey } from "./formationEventRowKey";'));
assert.ok(recorder.includes("makeFormationEventRowKey(occurredAt, eventId)"));
assert.ok(!/function\s+makeRowKey/.test(recorder));
assert.ok(!recorder.includes("randomBytes"));
assert.ok(!recorder.includes("}__${"));

const helper = fs.readFileSync(
  path.resolve(process.cwd(), "src/domain/formation/formationEventRowKey.ts"),
  "utf8"
);
const imports = helper.match(/^import .*$/gm) ?? [];
assert.deepEqual(imports, ['import crypto from "crypto";']);
assert.ok(!helper.includes("process.env"));
assert.ok(!/@azure|storage/i.test(imports.join("\n")));

console.log("Formation event row-key assertions passed.");
