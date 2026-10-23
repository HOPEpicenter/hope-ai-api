import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const writers = [
  {
    service: "src/services/staff/staffCommands.ts",
    operation: "createStaffIdentity",
    endpoint: "src/functions/postStaffIdentity/index.ts"
  },
  {
    service: "src/services/staff/staffCommands.ts",
    operation: "updateStaffIdentity",
    endpoint: "src/functions/patchStaffIdentity/index.ts"
  },
  {
    service: "src/services/staff/createStaffInvitation.ts",
    operation: "createStaffInvitation",
    endpoint: "src/functions/postStaffInvitation/index.ts"
  },
  {
    service: "src/services/staff/activateStaffInvitation.ts",
    operation: "activateStaffInvitation",
    endpoint: "src/functions/postStaffInvitationActivation/index.ts"
  }
] as const;

function trackedSource(path: string): string {
  return execFileSync("git", ["show", `HEAD:${path}`], {
    encoding: "utf8"
  });
}

// Inventory evidence only. No staff service is executed.
assert.equal(writers.length, 4);

for (const writer of writers) {
  const service = trackedSource(writer.service);
  const endpoint = trackedSource(writer.endpoint);

  assert.ok(
    service.includes(`function ${writer.operation}(`),
    `Missing declared staff operation: ${writer.operation}`
  );

  assert.ok(
    endpoint.includes(writer.operation),
    `Missing endpoint reference: ${writer.operation}`
  );

  assert.match(
    service,
    /await\s*\(repository\s+as\s+StaffEventWriter\)\.append\(event\)/,
    `Canonical append call missing: ${writer.operation}`
  );
  assert.ok(
    service.includes("StaffEventsRepository"),
    `Missing canonical repository reference: ${writer.operation}`
  );
}

const STAFF_WRITER_APPEND_INVENTORY = [
  "src/services/staff/activateStaffInvitation.ts",
  "src/services/staff/createStaffInvitation.ts",
  "src/services/staff/staffCommands.ts",
  "src/services/staff/staffCommands.ts"
] as const;

const trackedServices = execFileSync(
  "git",
  ["ls-files", "src/services/staff/*.ts"],
  { encoding: "utf8" }
)
  .split(/\r?\n/)
  .filter(Boolean);

const discoveredAppendSites: string[] = [];

for (const path of trackedServices) {
  const source = trackedSource(path);
  const matches = source.match(
    /await\s*\(repository\s+as\s+StaffEventWriter\)\.append\(event\)/g
  );

  for (let i = 0; i < (matches?.length ?? 0); i++) {
    discoveredAppendSites.push(path);
  }
}

// This is a narrow source-pattern guard, not a production fence.
assert.deepEqual(
  discoveredAppendSites.sort(),
  [...STAFF_WRITER_APPEND_INVENTORY].sort(),
  "Canonical staff writer append inventory changed; review required"
);
const canonicalRepository = trackedSource(
  "src/repositories/staffEventsRepository.ts"
);

assert.match(
  canonicalRepository,
  /async append\s*\(/
);

assert.match(
  canonicalRepository,
  /table\.createEntity/
);

// A direct event append is not evidence of shared OAuth atomicity.
// This test records that known baseline; it grants no authority.
console.log(
  "Staff writer bypass inventory evidence passed (non-authorizing)"
);
