$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$modulePath = Join-Path $PSScriptRoot "..\dist\services\followups\deriveTaskPreview.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled deriveTaskPreview module. Run npm run build first."
}

$script = @"
const mod = require(process.argv[1]);
const deriveTaskPreview = mod.deriveTaskPreview;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

const followup = {
  visitorId: "visitor-preview-dedup",
  assignedTo: { ownerId: "ops-preview-owner" },
  priorityBand: "normal",
  priorityReason: "needs_followup",
  followupUrgency: "AT_RISK",
  followupResolved: false
};

const healthyAudit = {
  drifted: false,
  profileBehind: false
};

const preview1 = deriveTaskPreview({ followup, audit: healthyAudit });
const preview2 = deriveTaskPreview({ followup: { ...followup }, audit: { ...healthyAudit } });

assert(JSON.stringify(preview1) === JSON.stringify(preview2), "preview derivation should be deterministic");
assert(preview1.visitorId === "visitor-preview-dedup", "preview should preserve visitorId");
assert(preview1.ownerId === "ops-preview-owner", "preview should preserve ownerId");
assert(preview1.candidateTaskType === "FOLLOWUP", "candidateTaskType should be FOLLOWUP");
assert(preview1.followupResolved === false, "unresolved followup should expose followupResolved=false");
assert(preview1.projectionHealthy === true, "healthy projection should expose projectionHealthy=true");
assert(preview1.candidateTaskEligible === true, "healthy unresolved owned followup should be eligible");
assert(preview1.candidateIdentityKey === preview2.candidateIdentityKey, "equivalent previews should share identity key");

const duplicateCandidates = [
  deriveTaskPreview({ followup, audit: healthyAudit }),
  deriveTaskPreview({ followup: { ...followup }, audit: { ...healthyAudit } })
];

const deduped = Array.from(
  new Map(duplicateCandidates.map((candidate) => [candidate.candidateIdentityKey, candidate])).values()
);

assert(deduped.length === 1, "duplicate logical previews should collapse by candidateIdentityKey");

const resolvedPreview = deriveTaskPreview({
  followup: {
    ...followup,
    followupResolved: true
  },
  audit: healthyAudit
});

assert(resolvedPreview.followupResolved === true, "resolved preview should expose followupResolved=true");
assert(resolvedPreview.candidateTaskEligible === false, "resolved followup should not be eligible");
assert(resolvedPreview.candidateIdentityKey !== preview1.candidateIdentityKey, "resolved/open identity should not collapse");

const driftedPreview = deriveTaskPreview({
  followup,
  audit: {
    drifted: true,
    profileBehind: false
  }
});

assert(driftedPreview.projectionHealthy === false, "drifted projection should not be healthy");
assert(driftedPreview.candidateTaskEligible === false, "drifted projection should suppress eligibility");

const ownerlessPreview = deriveTaskPreview({
  followup: {
    ...followup,
    assignedTo: null
  },
  audit: healthyAudit
});

assert(ownerlessPreview.ownerId === null, "ownerless preview should expose ownerId=null");
assert(ownerlessPreview.candidateTaskEligible === false, "ownerless followup should not be eligible");

console.log("OK: task preview derivation contract assertion passed.");
"@

node -e $script $modulePath
