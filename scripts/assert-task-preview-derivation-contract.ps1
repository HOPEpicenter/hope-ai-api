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

const serializeTaskPreview =
  mod.serializeTaskPreview;

const dedupeTaskPreviews =
  mod.dedupeTaskPreviews;

const sortTaskPreviews =
  mod.sortTaskPreviews;

const groupTaskPreviews =
  mod.groupTaskPreviews;

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
  preview1.previewFreshnessSeverity === "HEALTHY",
  "healthy projections should expose HEALTHY freshness"
);

const serialized1 =
  serializeTaskPreview(preview1);

const serialized2 =
  serializeTaskPreview(preview2);

assert(
  JSON.stringify(serialized1) === JSON.stringify(serialized2),
  "serialization should remain deterministic"
);

assert(
  serialized1.previewEscalationLevel === "ELEVATED",
  "serialized preview should preserve escalation level"
);

assert(
  serialized1.previewFreshnessSeverity === "HEALTHY",
  "serialized preview should preserve freshness severity"
);

assert(
  Array.isArray(serialized1.suppressionReasons),
  "serialized suppressionReasons should remain an array"
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
  resolvedPreview.suppressionReasons.includes("FOLLOWUP_RESOLVED"),
  "resolved preview should expose FOLLOWUP_RESOLVED suppression"
);

const driftedPreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: true,
    profileBehind: false
  }
});

assert(
  driftedPreview.previewFreshnessSeverity === "DRIFTED",
  "drifted projection should expose DRIFTED freshness"
);

const behindPreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: false,
    profileBehind: true
  }
});

assert(
  behindPreview.previewFreshnessSeverity === "PROFILE_BEHIND",
  "behind projection should expose PROFILE_BEHIND freshness"
);

const stalePreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: true,
    profileBehind: true
  }
});

assert(
  stalePreview.previewFreshnessSeverity === "STALE",
  "fully stale projection should expose STALE freshness"
);

const ownerlessPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    assignedTo: null
  },
  audit: healthyAudit
});

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

const grouped =
  groupTaskPreviews([
    preview1,
    highEscalationPreview,
    ownerlessPreview
  ]);

assert(
  grouped.length >= 2,
  "grouping should produce multiple deterministic groups"
);

const groupedAgain =
  groupTaskPreviews([
    ownerlessPreview,
    preview1,
    highEscalationPreview
  ]);

assert(
  JSON.stringify(grouped) === JSON.stringify(groupedAgain),
  "grouping should remain deterministic"
);

assert(
  grouped.every(group => typeof group.total === "number"),
  "group totals should remain numeric"
);

console.log(
  "OK: task preview derivation contract assertion passed."
);
"@

node -e $script $modulePath
