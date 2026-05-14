$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$modulePath = Join-Path $PSScriptRoot "..\dist\services\followups\deriveTaskPreview.js"

if (-not (Test-Path $modulePath)) {
  throw "Missing compiled deriveTaskPreview module. Run npm run build first."
}

$script = @"
const mod = require(process.argv[1]);

const deriveTaskPreview =
  mod.deriveTaskPreview;

const dedupeTaskPreviews =
  mod.dedupeTaskPreviews;

const sortTaskPreviews =
  mod.sortTaskPreviews;

function assert(condition, message) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message);
  }
}

const healthyAudit = {
  drifted: false,
  profileBehind: false
};

const baseFollowup = {
  visitorId: "visitor-preview-dedup",
  assignedTo: {
    ownerId: "ops-preview-owner"
  },
  priorityBand: "normal",
  priorityReason: "needs_followup",
  followupUrgency: "AT_RISK",
  followupResolved: false
};

const preview1 = deriveTaskPreview({
  followup: baseFollowup,
  audit: healthyAudit
});

const preview2 = deriveTaskPreview({
  followup: { ...baseFollowup },
  audit: { ...healthyAudit }
});

assert(
  JSON.stringify(preview1) === JSON.stringify(preview2),
  "preview derivation should be deterministic"
);

assert(
  preview1.visitorId === "visitor-preview-dedup",
  "preview should preserve visitorId"
);

assert(
  preview1.ownerId === "ops-preview-owner",
  "preview should preserve ownerId"
);

assert(
  preview1.candidateTaskType === "FOLLOWUP",
  "candidateTaskType should be FOLLOWUP"
);

assert(
  preview1.followupResolved === false,
  "unresolved followup should expose followupResolved=false"
);

assert(
  preview1.projectionHealthy === true,
  "healthy projection should expose projectionHealthy=true"
);

assert(
  preview1.candidateTaskEligible === true,
  "healthy unresolved owned followup should be eligible"
);

assert(
  preview1.previewEscalationLevel === "ELEVATED",
  "AT_RISK followups should escalate to ELEVATED"
);

assert(
  preview1.suppressionReasons.length === 0,
  "eligible preview should not expose suppression reasons"
);

assert(
  preview1.candidateIdentityKey === preview2.candidateIdentityKey,
  "equivalent previews should share identity key"
);

const duplicateCandidates = [
  deriveTaskPreview({
    followup: baseFollowup,
    audit: healthyAudit
  }),
  deriveTaskPreview({
    followup: { ...baseFollowup },
    audit: { ...healthyAudit }
  })
];

const deduped =
  dedupeTaskPreviews(duplicateCandidates);

assert(
  deduped.length === 1,
  "duplicate logical previews should collapse by candidateIdentityKey"
);

const resolvedPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    followupResolved: true
  },
  audit: healthyAudit
});

assert(
  resolvedPreview.followupResolved === true,
  "resolved preview should expose followupResolved=true"
);

assert(
  resolvedPreview.candidateTaskEligible === false,
  "resolved followup should not be eligible"
);

assert(
  resolvedPreview.suppressionReasons.includes("FOLLOWUP_RESOLVED"),
  "resolved preview should expose FOLLOWUP_RESOLVED suppression"
);

assert(
  resolvedPreview.candidateIdentityKey !== preview1.candidateIdentityKey,
  "resolved/open identity should not collapse"
);

const driftedPreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: true,
    profileBehind: false
  }
});

assert(
  driftedPreview.projectionHealthy === false,
  "drifted projection should not be healthy"
);

assert(
  driftedPreview.candidateTaskEligible === false,
  "drifted projection should suppress eligibility"
);

assert(
  driftedPreview.suppressionReasons.includes("PROJECTION_DRIFTED"),
  "drifted preview should expose PROJECTION_DRIFTED suppression"
);

const behindPreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: false,
    profileBehind: true
  }
});

assert(
  behindPreview.suppressionReasons.includes("PROJECTION_PROFILE_BEHIND"),
  "behind preview should expose PROJECTION_PROFILE_BEHIND suppression"
);

const ownerlessPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    assignedTo: null
  },
  audit: healthyAudit
});

assert(
  ownerlessPreview.ownerId === null,
  "ownerless preview should expose ownerId=null"
);

assert(
  ownerlessPreview.candidateTaskEligible === false,
  "ownerless followup should not be eligible"
);

assert(
  ownerlessPreview.suppressionReasons.includes("OWNER_MISSING"),
  "ownerless preview should expose OWNER_MISSING suppression"
);

const highEscalationPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    priorityBand: "urgent",
    followupUrgency: "CRITICAL"
  },
  audit: healthyAudit
});

assert(
  highEscalationPreview.previewEscalationLevel === "HIGH",
  "critical followups should escalate to HIGH"
);

const sorted = sortTaskPreviews([
  preview1,
  ownerlessPreview,
  highEscalationPreview
]);

assert(
  sorted[0].previewEscalationLevel === "HIGH",
  "HIGH escalation previews should sort first"
);

const sortedAgain = sortTaskPreviews([
  ownerlessPreview,
  highEscalationPreview,
  preview1
]);

assert(
  JSON.stringify(sorted) === JSON.stringify(sortedAgain),
  "sorting should remain deterministic"
);

console.log(
  "OK: task preview derivation contract assertion passed."
);
"@

node -e $script $modulePath
