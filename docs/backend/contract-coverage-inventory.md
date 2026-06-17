# Backend Contract Coverage Inventory

Date: 2026-06-16

Purpose: track HTTP route coverage after Express/Azure Functions parity hardening.

Status: Express route parity is considered effectively aligned with Azure Functions HTTP routes after PRs #1110-#1117. This file tracks remaining contract coverage posture and helps prevent future drift.

| Route | Function | Express Parity | Regression Coverage | Notes |
|---|---|---:|---:|---|
| `/api/health` | `health` | Yes | Yes | Smoke/preflight coverage. |
| `/api/version` | `version` | Yes | Yes | Smoke coverage. |
| `/api/visitors` | `createVisitor`, `listVisitors` | Yes | Yes | Smoke/regression coverage. |
| `/api/visitors/{visitorId}` | `getVisitor`, `updateVisitor` | Yes | Yes | Visitor mutation parity added. |
| `/api/visitors/{visitorId}/notes` | `postVisitorNote` | Yes | Yes | Visitor mutation parity added. |
| `/api/visitors/{id}/summary` | `getVisitorSummary` | Yes | Yes | Summary/Journey regression coverage. |
| `/api/visitors/{id}/dashboard-card` | `getVisitorDashboardCard` | Yes | Yes | Dedicated dashboard card contract added in PR #1120. |
| `/api/visitors/{visitorId}/journey` | `getVisitorJourney` | Yes | Yes | Journey smoke/regression coverage. |
| `/api/visitors/{id}/activity-insights` | `getVisitorActivityInsights` | Yes | Yes | Final route parity contract. |
| `/api/visitors/{id}/formation/events` | `getVisitorFormationEvents` | Yes | Yes | Formation pagination/idempotency/reconciliation coverage. |
| `/api/visitors/{id}/formation/profile` | `getVisitorFormationProfile` | Yes | Yes | Formation profile coverage. |
| `/api/visitors/{id}/formation/profile/rebuild` | `postFormationProfileRebuild` | Yes | Yes | Rebuild/reconciliation coverage. |
| `/api/formation/events` | `postFormationEvent` | Yes | Yes | Broad formation regression coverage. |
| `/api/formation/profiles` | `getFormationProfiles` | Yes | Yes | Formation profile list coverage. |
| `/api/formation/timeline` | `getFormationTimeline` | Yes | Yes | Formation/timeline coverage. |
| `/api/engagements/events` | `postEngagementEvent` | Yes | Yes | Engagement E2E coverage. |
| `/api/engagements/score` | `getEngagementScore` | Yes | Yes | Engagement E2E coverage. |
| `/api/engagements/status` | `getEngagementStatus` | Yes | Yes | Engagement E2E coverage. |
| `/api/engagements/timeline` | `getEngagementTimeline` | Yes | Yes | Timeline coverage. |
| `/api/engagements/{visitorId}/timeline` | `getVisitorEngagementTimeline` | Yes | Yes | Visitor engagement timeline contract. |
| `/api/integration/summary` | `getIntegrationSummary` | Yes | Yes | Multiple integration summary contracts. |
| `/api/integration/timeline` | `getIntegrationTimeline` | Yes | Yes | Cursor/timeline contracts. |
| `/api/integration/timeline/global` | `getGlobalIntegrationTimeline` | Yes | Yes | Global unified timeline regression. |
| `/api/care/summary` | `getCareSummary` | Yes | Yes | Care summary contract. |
| `/api/care/export` | `getCareExport` | Yes | Yes | Care export consistency contracts. |
| `/api/care/candidates` | `getCareCandidates` | Yes | Yes | Care list/assignment contracts. |
| `/api/care/candidates/{visitorId}` | `getCareCandidate` | Yes | Yes | Care candidate contracts. |
| `/api/care/candidates/{visitorId}/assign` | `postCareCandidateAssign` | Yes | Yes | Care assignment contracts. |
| `/api/care/candidates/{visitorId}/unassign` | `postCareCandidateUnassign` | Yes | Yes | Care unassignment contracts. |
| `/api/care/candidates/assign-bulk` | `postCareCandidateAssignBulk` | Yes | Yes | Bulk assignment contracts. |
| `/api/care/candidates/unassign-bulk` | `postCareCandidateUnassignBulk` | Yes | Yes | Bulk unassignment contracts. |
| `/api/activity-intelligence` | `getActivityIntelligence` | Yes | Yes | Dedicated activity intelligence response-shape contract added in PR #1121. |
| `/api/activity-intelligence/opportunities/{segment}` | `getOpportunityWorklist` | Yes | Yes | Opportunity worklist regression. |
| `/api/dashboard/followups` | `getDashboardFollowups` | Yes | Yes | Dashboard followups parity and OPS projection contracts. |
| `/api/ops/followups` | `getOpsFollowups` | Yes | Yes | OPS followups lifecycle/order coverage. |
| `/api/ops/task-preview-summary` | `getOpsTaskPreviewSummary` | Yes | Yes | OPS/task preview contracts. |
| `/api/ops/task-preview-simulation` | `getOpsTaskPreviewSimulation` | Yes | Yes | OPS/task preview simulation contract. |
| `/api/_ops/formation/recent-events` | `getOpsFormationRecentEvents` | Yes | Partial | OPS diagnostic surface; not pilot-facing. |
| `/api/_ops/formation/profile-audit` | `postOpsFormationProfileAudit` | Yes | Yes | Formation audit/repair contracts. |
| `/api/_protected/ping` | `protectedPing` | Yes | Yes | Final route parity contract. |
| `/api/legacy/export` | `getLegacyExport` | Yes | Partial | Legacy/export surface; not a priority unless used by migration/export workflows. |

## Readiness notes

- Route parity work is complete enough to stop route hunting.
- Highest-value next backend work is contract depth, not more endpoint exposure.
- Candidate future contracts only if pilot-critical:
  - dashboard card response-shape contract
  - activity intelligence response-shape contract
  - legacy export contract only if export workflow remains active
  - `_ops/formation/recent-events` contract only if OPS diagnostics become part of routine operations