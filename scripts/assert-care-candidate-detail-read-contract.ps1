$ErrorActionPreference = "Stop"

Write-Host "Running care candidate detail read contract..."

$modulePath = Join-Path $PSScriptRoot "..\dist\services\care\readCareCandidateByVisitorId.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled readCareCandidateByVisitorId module. Run npm run build first."
}

node -e @"
const mod = require(process.argv[1]);
const readCareCandidateByVisitorId =
  mod.readCareCandidateByVisitorId;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

const found = readCareCandidateByVisitorId({
  visitorId: "visitor-care",
  profiles: [
    {
      visitorId: "visitor-care",
      assignedTo: "ops-user-1",
      lastFollowupOutcome: "needs_care",
      lastFollowupOutcomeAt: "2026-06-02T18:00:00.000Z",
      now: new Date("2026-06-05T18:00:00.000Z")
    }
  ]
});

assert(found.ok === true, "result should be ok");
assert(found.found === true, "candidate should be found");
assert(found.item !== null, "candidate item should exist");
assert(found.item.visitorId === "visitor-care", "visitorId should match");

const missing = readCareCandidateByVisitorId({
  visitorId: "missing",
  profiles: []
});

assert(missing.found === false, "missing candidate should not be found");
assert(missing.item === null, "missing item should be null");

console.log("OK: care candidate detail read contract passed.");
"@ $modulePath
