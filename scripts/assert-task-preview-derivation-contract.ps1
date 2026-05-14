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

const buildTaskPreviewPlan =
  mod.buildTaskPreviewPlan;

const summarizeTaskPreviewPlans =
  mod.summarizeTaskPreviewPlans;

const serializeTaskPreview =
  mod.serializeTaskPreview;

const filterTaskPreviews =
  mod.filterTaskPreviews;

const summarizeTaskPreviews =
  mod.summarizeTaskPreviews;

const dedupeTaskPreviews =
  mod.dedupeTaskPreviews;

const sortTaskPreviews =
  mod.sortTaskPreviews;

const groupTaskPreviews =
  mod.groupTaskPreviews;

const TASK_PREVIEW_SCHEMA_VERSION =
  mod.TASK_PREVIEW_SCHEMA_VERSION;

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
  "preview derivation should remain deterministic"
);

const serialized1 =
  serializeTaskPreview(preview1);

const serialized2 =
  serializeTaskPreview(preview2);

assert(
  serialized1.schemaVersion === TASK_PREVIEW_SCHEMA_VERSION,
  "serialized previews should expose schemaVersion"
);

assert(
  JSON.stringify(serialized1) === JSON.stringify(serialized2),
  "serialization should remain deterministic"
);

const plan1 =
  buildTaskPreviewPlan(preview1);

const plan2 =
  buildTaskPreviewPlan(preview2);

assert(
  JSON.stringify(plan1) === JSON.stringify(plan2),
  "plan generation should remain deterministic"
);

assert(
  plan1.planReadiness === "READY",
  "eligible healthy previews should produce READY plans"
);

assert(
  plan1.schemaVersion === TASK_PREVIEW_SCHEMA_VERSION,
  "plans should expose schemaVersion"
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

const resolvedPlan =
  buildTaskPreviewPlan(resolvedPreview);

assert(
  resolvedPlan.planReadiness === "SUPPRESSED",
  "resolved previews should produce SUPPRESSED plans"
);

assert(
  resolvedPlan.suppressionReasons.includes("FOLLOWUP_RESOLVED"),
  "resolved plans should preserve suppression reasons"
);

const stalePreview = deriveTaskPreview({
  followup: baseFollowup,
  audit: {
    drifted: true,
    profileBehind: true
  }
});

const stalePlan =
  buildTaskPreviewPlan(stalePreview);

assert(
  stalePlan.planReadiness === "STALE",
  "STALE previews should produce STALE plans"
);

const ownerlessPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    assignedTo: null
  },
  audit: healthyAudit
});

const ownerlessPlan =
  buildTaskPreviewPlan(ownerlessPreview);

assert(
  ownerlessPlan.planReadiness === "SUPPRESSED",
  "ownerless previews should produce SUPPRESSED plans"
);

const highEscalationPreview = deriveTaskPreview({
  followup: {
    ...baseFollowup,
    visitorId: "visitor-high",
    priorityBand: "urgent",
    followupUrgency: "CRITICAL"
  },
  audit: healthyAudit
});

const allPreviews = [
  preview1,
  resolvedPreview,
  stalePreview,
  ownerlessPreview,
  highEscalationPreview
];

const allPlans =
  allPreviews.map(buildTaskPreviewPlan);

const planSummary =
  summarizeTaskPreviewPlans(allPlans);

assert(
  planSummary.totalPlans === allPlans.length,
  "plan summary total should reconcile"
);

assert(
  planSummary.readyPlans >= 1,
  "plan summary should count READY plans"
);

assert(
  planSummary.suppressedPlans >= 1,
  "plan summary should count SUPPRESSED plans"
);

assert(
  planSummary.stalePlans >= 1,
  "plan summary should count STALE plans"
);

assert(
  planSummary.readyPlans +
    planSummary.suppressedPlans +
    planSummary.stalePlans ===
    planSummary.totalPlans,
  "plan readiness counts should reconcile"
);

const eligibleOnly =
  filterTaskPreviews(allPreviews, {
    eligibleOnly: true
  });

assert(
  eligibleOnly.every(x => x.candidateTaskEligible),
  "eligibleOnly filter should only return eligible previews"
);

const summary =
  summarizeTaskPreviews(allPreviews);

assert(
  summary.total === allPreviews.length,
  "summary total should match preview count"
);

const sorted = sortTaskPreviews([
  preview1,
  ownerlessPreview,
  highEscalationPreview
]);

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

console.log(
  "OK: task preview derivation contract assertion passed."
);
"@

node -e $script $modulePath
