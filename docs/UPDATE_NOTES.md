## 2026-06-02 — Milestone Regression Coverage Closeout

- Reviewed existing formation milestone and profile invariant regression coverage.
- Confirmed repeated milestone events and same-timestamp tie-break behavior are already covered by scripts/assert-formation-milestones-v1.ps1.
- Confirmed profile reconciliation, duplicate replay, out-of-order behavior, and snapshot invariants are already covered by existing formation profile reconciliation and snapshot invariant assertions.
- No duplicate regression script was added.
## 2026-06-02 — Operational Hardening Review Closeout

- Reviewed operational health, replay integrity, audit, repair, diagnostics, observability, telemetry, and simulation surfaces.
- Confirmed existing OPS audit/repair tooling, drift detection, replay validation, health checks, and operational regression coverage remain in place.
- Confirmed operational simulation and governance surfaces remain deterministic and read-only.
- No material operational hardening gaps were identified that warrant additional backend scope at this time.
- Closed the remaining operational hardening review checklist item.
## 2026-06-02 — Derived Insights Closeout

- Reviewed existing derived insight and analytics surfaces.
- Confirmed derived insights already exist through engagement score, engagement risk, visitor activity insights, journey read models, integration summaries, followup prioritization signals, and related read-only views.
- Kept the architectural rule: derive from existing event/read-model truth and avoid storing derived state unless necessary.
- No new insight endpoint, storage table, dashboard expansion, or AI-derived insight layer was added.
## 2026-06-02 — Streaming Export Format Discovery

- Reviewed repo references for streaming/export format, CSV, NDJSON, download, and export-job concepts.
- Confirmed no explicit streaming export contract or format design currently exists.
- Kept the existing v1 JSON legacy export as the supported export payload.
- Deferred streaming/export format until there is an explicit design decision.
- Avoided adding an ad hoc export format or new public surface.
## 2026-06-02 — Long-Horizon History Closeout

- Reviewed existing history/timeline surfaces.
- Confirmed long-horizon history is already supported through cursor-paged integration and global timeline surfaces.
- Legacy export payload v1 now complements those read-side history views.
- No new endpoint or storage layer was needed.
- Streaming export format and derived insights remain separate future items.
## 2026-06-02 — Legacy Export Payload v1

- Wired Azure Function GET /api/legacy/export to the existing LegacyExportService.
- Endpoint now returns the v1 export payload with visitor, engagement, formation, and integration sections.
- Added local Azure Functions regression coverage using the existing legacy export assertion.
- Kept scope narrow: no streaming export, long-horizon history views, dashboard changes, or derived insights expansion.
## 2026-06-01 — Teams Registry v1

- Added read-only GET /ops/teams Teams Registry v1 endpoint.
- Added regression coverage for the Teams Registry v1 endpoint.
- Kept scope intentionally narrow: no storage, writes, team assignment workflow, membership, RBAC, or dashboard expansion.
- CI and staging deploy passed after merge.

## 2026-05-19 — Ordering governance consolidation

- centralized followups queue comparison helpers
- unified canonical timeline newest-first ordering usage
- removed redundant legacy export re-sorting
- aligned formation timeline retrieval with shared ordering semantics
- added rowKey-aware tie-break support to shared timeline ordering helpers
- centralized preview ordering comparator semantics
- reduced duplicated inline Date.parse / localeCompare ordering logic across followups, integration, legacy export, and reconciliation paths
## 2026-05-19 Update — Projection Integrity + Pagination Hardening Wave

### What landed

Completed a major backend regression-hardening and canonical contract stabilization wave.

Canonical contract extraction + normalization:
- extracted canonical dashboard card contracts
- extracted canonical visitor snapshot contracts
- strengthened canonical narrative typing contracts
- centralized dashboard/snapshot contract ownership

Projection integrity hardening:
- added orphan followup exclusion assertions
- added projection integrity assertion coverage
- validated projection lag + repair diagnostics

Followups pagination hardening:
- added deterministic cursor replay assertions
- added pagination overlap detection
- added pagination boundary assertions
- added past-end cursor assertions
- added limit=1 pagination assertions

Formation projection repair hardening:
- added steady-state repair assertions
- validated post-repair drift-free behavior
- validated stable repair audit semantics

### Why this matters

- strengthens replay-safe operational guarantees
- hardens deterministic pagination semantics
- reduces future projection drift/debugging risk
- preserves backend-first operational architecture

### Validation

- CI green across merged slices
- staging deploy green across merged slices
- regression assertions green

## 2026-04-24 — Backend hardening final closeout

- Merged #700/#701: added and corrected the unified backend runner so scripts/run-backend-all.ps1 is self-contained.
- Merged #702/#703: marked /ops/followups as ops-only and normalized followups usage away from /api/ops/followups.
- Merged #704: removed the Engagement E2E skip path so smoke/E2E coverage fails loudly instead of silently skipping.
- Current trusted local backend verification command:
  `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-backend-all.ps1`
- Current backend posture: strict gates, no known stale SKIP paths except intentional/non-backend legacy cases, clean /api product vs /ops tooling boundary.

## 2026-04-21 — Engagement Intelligence + Ops Queue Priority

### Summary
Completed the end-to-end engagement intelligence slice and connected it to operator-facing surfaces.

### Shipped
- Added GET /api/engagements/risk
- Surfaced engagement risk into visitor summary
- Surfaced risk + priority into dashboard card
- Added shared 
- Added shared readEngagementRiskV1 reader
- Added shared deriveFollowupPriority helper
- Enriched /ops/followups queue items with:
  - nengagementRiskLevel
  - nengagementRiskScore
  - priorityBand
  - priorityReason
- Updated queue prioritization to consider engagement risk before legacy SLA score

### Validation
- scripts/assert-engagement-risk.ps1
- scripts/assert-visitor-risk-surface.ps1
- scripts/assert-followup-priority.ps1
- scripts/assert-followup-queue-priority.ps1
- scripts/smoke-visitor-engagements-e2e.ps1

### Outcome
The system now supports:
- engagement score
- engagement risk / drift
- visitor summary + dashboard risk surfaces
- followup priority signals
- ops queue enrichment using behavioral risk

## 2026-04-21 — Integration Cutover Stabilization (PR #655)

### Summary
Stabilized global timeline cutover and fixed cross-scope data contamination.

### Changes
- Scoped shadow reads to global endpoint only
- Fixed routing for integration endpoints
- Restored correct ordering behavior
- Stabilized tie ordering in asserts
- Verified global timeline parity

### Outcome
- Visitor timeline returns correct scoped data
- Global timeline validated and production-ready
- All integration asserts passing

## 2026-04-01

- ✅ Merged **#490**: added GET /api/integration/timeline/global (global unified timeline).
- Global timeline is now available as a protected API surface.
- Endpoint supports limit + cursor paging aligned with integration timeline contract.
- Initial implementation is formation-backed (engagement merge deferred).
- Verified:
  - CI green
  - staging deploy green
  - dashboard proxy (/api/dashboard/timeline/unified) successfully returns data


## 2026-03-29 — Formation profile truth / parity lane closed

- ✅ Merged **#451**: restored formation profile endpoint parity by removing fallback rows so list/profile now agree.
- ✅ Merged **#452**: bridged engagement events into formation projection.
- ✅ Merged **#453**: normalized single formation profile response shape.
- ✅ Merged **#454**: normalized formation profiles list response shape.
- ✅ Merged **#455**: added PowerShell backfill script for engagement → formation recovery.
- ✅ Merged **#456**: normalized assignedTo in formation projection.
- ✅ Merged **#457**: added regression asserts for assignedTo and removed storage leakage.
- ✅ CI and staging deploys green after final slices.


## 2026-03-27

- ✅ Merged **#438–#444**: dashboard readability and scanability polish across timeline and visitors table.
- Timeline:
  - removed event ID from cards to reduce noise
  - softened empty summary fallback copy
  - improved long-text wrapping behavior
  - refined spacing and reduced time-label dominance
  - removed duplicate timestamp display and clarified page copy
- Visitors table:
  - compacted visitor ID cell with inline copy control
  - softened empty-cell placeholders using em dash styling
  - improved truncation + layout behavior for long IDs

### Dashboard readability note

- These slices improve operator scanability and reduce visual noise without changing behavior or backend scope.
- Timeline and visitors surfaces are now easier to read under real data conditions (long text, empty states, dense rows).
- No new surfaces or workflows were introduced.

## 2026-03-25

- ✅ Merged **#398**: emphasized the next operator action on visitor detail based on followup state.
- ✅ Merged **#399**: surfaced assignee in the visitor detail header.
- ✅ Merged **#400**: simplified the resolved visitor action zone with a passive closed-state summary.
- ✅ Merged **#401**: surfaced last activity in the visitor detail header.
- ✅ Merged **#402**: added a header-level unassign quick action on visitor detail.
- ✅ Merged **#403**: added a header-level assign-to-me quick action on visitor detail.
- ✅ Merged **#404**: surfaced needs-attention state in the visitor detail header.
- ✅ Merged **#405**: linked the visitor detail attention chip to the action zone.
- ✅ Merged **#406**: linked the visitors-table needs-attention badge to the needs-attention preset.
- ✅ Merged **#407**: linked visitors-table assignee values to ownership presets.
- ✅ Merged **#408**: preserved visitors preset context in the detail flow.
- ✅ Merged **#409**: preserved preset context after assign/contact/outcome actions on visitor detail.
- ✅ Merged **#410**: added a back-to-queue CTA on visitor detail success banners when a preset is present.
- ✅ Merged **#412**: added a `Next visitor` CTA to visitor detail success banners for preset-driven flows.
- ✅ Merged **#413**: made `Next visitor` navigate directly to the next visitor within the same preset queue, with queue fallback when needed.
- ✅ Merged **#414**: updated `Azure/functions-action` from `v1.5.1` to `v1.5.3`.
- ✅ Merged **#416**: aligned the visitors-table actions column so inline outcome editing stays readable and left-aligned.

- ✅ Verified CI green after merged slices.
- ✅ Verified staging deploy green after merged slices.
- ✅ Verified local operator validation passed for waiting-assignment queue flow, last-item fallback, no-preset regression, and dashboard smoke routes.
- ✅ Verified staging deploy rerun passed after a transient trigger-sync failure on **#416**.

### Dashboard v1.1 operator-flow note

These post-v1 slices improved the dashboard’s operator workflow without widening backend scope:

- visitor detail now surfaces ownership, freshness, attention state, and state-aware quick actions in the header
- visitor detail action flow now emphasizes the next action and de-noises resolved records
- list/detail navigation now preserves queue context
- attention and ownership signals now act as direct navigation shortcuts
- success flows now provide both queue return and direct next-visitor continuation
- preset-driven queue work can now continue from one detail record to the next with less operator friction

### Deploy/workflow maintenance note

- staging and CI remained green after the workflow maintenance slice
- `azure/login@v3` is now used for the deploy workflow Node 24 runtime path; prior Node 20 deprecation follow-up is resolved
## 2026-03-14

- ✅ Merged **#330**: staging deploy switched from config-zip to `func azure functionapp publish --no-build`.
- ✅ Merged **#331**: staging workflow now installs Azure Functions Core Tools on the runner.
- ✅ Merged **#332**: staging `func publish` now passes `--javascript` explicitly so runtime detection is stable.
- ✅ Merged **#333**: removed unused `.deploy` / `deploy.zip` packaging from staging workflow after switching to `func publish`.

- ✅ Merged **#334**: moved the inline followup outcome editor into the actions column and preserved the short success state before refresh.
- ✅ Merged **#335**: tightened integration summary followup derivation so `needsFollowup` / `followupReason` stay aligned with `deriveIntegrationSummaryV1` while preserving additive summary fields.
- ✅ Merged **#336**: improved followups actions scanability with a “Needs attention” pill and clearer grouping for rows that still need followup.
- ✅ Merged **#338**: added a URL-backed `Needs attention` quick filter with chip + clear-all integration.
- ✅ Merged **#339**: tightened followups preset active states so highlighting reflects the full effective filter state.
- ✅ Merged **#340**: tightened 24h+/48h+/72h+ age summary card active states so highlighting reflects the full effective filter state.
- ✅ Merged **#341**: tightened the `Needs attention` preset active state so highlighting reflects the full effective filter state.
- ✅ Merged **#342**: made age summary card presets clear assignee so preset behavior matches the tightened active-state rules.
- ✅ Merged **#343**: made the `Needs attention` preset apply a clean preset state when clicked.
- ✅ Merged **#345**: made followups presets and age cards clear search, and included search in active-state truthfulness.
- ✅ Merged **#346**: made row-level age filters apply a clean state.
- ✅ Merged **#347**: made row-level queue filters apply a clean state.
- ✅ Merged **#348**: made row-level stage filters apply a clean state.
- ✅ Merged **#349**: made row-level outcome and assignee filters apply a clean state.

- ✅ Verified CI green after the merged slices.
- ✅ Verified staging deploy green after staging workflow fixes and followups dashboard slices.
- ✅ Verified staging `/api/version` returned 200 after deploy.

# UPDATE_NOTES.md

## 2026-03-12

- ✅ Merged **#300**: followups dashboard active filter chips + clear-all control.
- ✅ Merged **#301**: followups aging summary cards are now clickable presets.
- ✅ Verified CI green after both merges.
- ✅ Verified staging deploy green after both merges.
## 2026-02-28

- Merged: #165 feat(api): list visitors (GET /api/visitors) + CI smoke/auth-scoping alignment
- Merged: #166 chore(visitors): remove duplicate email reservation block
- Merged: #167 chore(visitors): make visitor list ordering deterministic (sort by updatedAt desc)
- CI: Auth scoping expectations (401/400) are executed in CI (assert-auth-scoping.ps1) via ci-run-express-smoke.

## 2026-02-27

- ✅ OPS: GET /ops/followups now ensures the formation profiles table exists before listing (prevents errors on fresh Azurite).
- ✅ OPS: followups items now include 
esolvedForAssignment so queue logic can suppress “already resolved” rows without adding write endpoints under /ops/*.
## 2026-02-25

- ✅ Merged **#139**: regression runner now includes integration summary followupReason/assignedTo consistency contract (runs only when HOPE_API_KEY is set).
- ✅ Merged **#140**: CI uses repo secret HOPE_API_KEY with a safe fallback to ci-key (keeps CI green until secrets are configured).
- ✅ Merged **#141**: nsureTableExists hardened for Azurite/CI races (treat already-exists cases as OK: 409 + common codes).
- 🧹 Closed stale bundled CI PRs (**#2–#5**) and recreated minimal safe changes on current main.


### OPS vs API surface (dev discipline)

- `/ops/*` is dev/admin tooling only (internal operators + scripts; not the public surface).
- `/api/*` is the public-ish surface (the contract we treat as “product/API”).
- After every major update, verify/update dev seed + helper scripts (`dev-seed.ps1`, `dev-functions.ps1`, `dev-up.ps1`) and record it here + in the master plan (stay prod-like).
- 2026-02-23: Post-merge hardening after integration deep paging:
  - Added timeline paging regressions (limit=1 no overlap; cross-stream boundary).
  - Smoke now validates cursor is URL-safe (no whitespace) and round-trips with URL escaping.
  - Local dev: smoke storage-backed EMAIL index repair requires STORAGE_CONNECTION_STRING (Azurite ok via UseDevelopmentStorage=true); otherwise it is skipped.

## 2026-02-26

- ✅ Fixed regression runner parse failure by removing leftover merge markers in scripts/regression.ps1.
- ✅ Verified local regression runs green with HOPE_API_KEY set (integration summary assignedTo + followup consistency contracts executed).


- ✅ Contract suite normalizes HOPE_BASE_URL to root (prevents /api/api path bugs).


## 2026-03-05
- Staging deploy packaging: Oryx/build disabled; staged .deploy zip now installs prod deps via npm ci --omit=dev so the artifact is self-contained. (PR #197)
- Cleanup: removed orphan root function folder opsFollowups/ that caused Core Tools discovery errors (function.json without entryPoint). (PR #198)
- Visitors: implemented POST /api/visitors (createVisitor) + GET /api/visitors/{visitorId} (getVisitor) using Azure Table Storage (Visitors table; PK=visitors, RK=visitorId). Shared table client helper + ensure table exists. (PRs #199, #200)
- Verified staging: /api/health, /api/version, POST/GET visitors (read-after-write) on hope-ai-api-staging.azurewebsites.net.
## 2026-03-10

- ✅ Merged **#271**: dashboard relative timestamps across visitors, visitor detail, followups, and timeline.
- ✅ Merged **#272**: dashboard sort order polish for freshness and operator urgency.
- ✅ Merged **#273**: dashboard empty state messaging polish.
- ✅ Merged **#274**: dashboard copy and label polish across dashboard shell and table surfaces.
- ✅ Merged **#275**: clarified Formation stage metadata docs contract (`stageUpdatedAt / stageUpdatedBy / stageReason` are stage-change metadata, not generic profile outputs).


## 2026-03-17 — Followups dashboard sync (#353–#363)

Merged followups dashboard work after the prior docs sync:

- #353 — unified followup outcome row actions into the row-action surface
- #358 — polished followup row visuals
- #361 — added keyboard outcome entry shortcuts
- #362 — added row action re-entry guards
- #363 — completed outcome action guard parity

Outcome:
- followups operator flow is now more consistent on a single action surface
- keyboard save/cancel support is in place for outcome entry
- row actions now have tighter guard coverage against accidental re-entry
- CI and staging deploy completed successfully for each merged slice

## 2026-03-17 — Dashboard v1 release closeout

Marked Dashboard v1 release-ready after:
- dashboard foundation completion
- followups closeout sync
- final followups row alignment polish
- green CI
- successful staging deploy verification

V1 shipped surfaces:
- Overview
- Follow-Ups
- Visitors
- Visitor Detail
- Timeline

Post-closeout rule:
- no additional dashboard feature expansion by default
- new work should be either:
  - blocker-driven
  - contract-fix driven
  - explicitly scoped as post-v1 work

## 2026-03-17 — Phase 3/4 closeout sync

Closed out docs and staging verification for the current Phase 3/4 surface.

Formation status:
- formation profile snapshot surface remains in place
- formation milestones v1 contract/assert coverage remains in place

Integration status:
- integration summary/timeline surface remains in place
- integration summary invariant/assert coverage remains in place

Verification:
- CI green on main
- staging deploy green on main
- no new Formation or Integration code added in this closeout
- future work should be blocker-driven, not speculative expansion


## 2026-03-26

- ✅ Merged **#420**: made the dashboard followups loader API-only compatible by replacing `/ops/followups` with `GET /api/formation/profiles?limit=200` and deriving unresolved followup rows client-side.
- ✅ Verified dashboard staging on Vercel now works against the API-only Azure Functions host.
- ✅ Verified remote pages load successfully on staging: `/overview`, `/followups`, `/visitors`, `/timeline`.
- ✅ Verified `scripts/run-smoke-remote.ps1` passes against `https://hope-ai-api-staging.azurewebsites.net` and correctly detects the API-only Functions host.

### Dashboard API-only compatibility note

- Dashboard followups no longer depend on the `/ops/*` surface.
- Dashboard staging compatibility is preserved by using existing hardened `/api/*` surfaces first.
- No backend scope expansion was required for this fix.


## 2026-03-26

- ✅ Merged **#422**: added visitors search including visitor ID matching, and fixed visitors table overflow so email, visitor ID, copy button, and last activity no longer collide.
- ✅ Merged **#423**: upgraded Overview from a mock-first summary to a real operator triage page using existing visitors and followups surfaces.
- ✅ Verified dashboard staging on Vercel for `/overview` and `/visitors` after the merged slices.
- ✅ Confirmed `/overview` now provides actionable queue entry points without widening backend scope.
- ✅ Confirmed `/visitors` search works by visitor ID and the table layout remains readable on staging.

### Dashboard operator-surface note

- `/overview` now acts as a practical triage surface instead of a placeholder summary.
- `/visitors` now supports direct visitor ID lookup and cleaner table scanning.
- Timeline remains intentionally deferred until a real consumer or blocker appears.


## 2026-03-26

- Engagement: merged PR #425 to add `GET /api/engagements/{visitorId}/timeline`, exposing a visitor-level integrated timeline backed by existing engagement + formation records.
- Engagement: merged PR #426 to add `scripts/assert-visitor-engagement-timeline.ps1` and wire it into `scripts/regression.ps1`, locking the new timeline contract with mixed-stream regression coverage.
- Validation: CI green after merge; staging Azure Functions deploy green after merge.
- Outcome: Phase 2 Engagement now has a deterministic, visitor-scoped timeline truth surface plus regression protection.


## 2026-03-26

- Dashboard: merged PR #428 to show the integrated visitor engagement timeline on `/visitors/[visitorId]`.
- Dashboard: visitor detail now consumes the backend engagement timeline truth using the existing timeline list component.
- Dashboard: normalized assigned owner handling on visitor detail so assigned followups display correctly and next-action guidance stays accurate.
- Dashboard: fixed visitor detail layout so long email values no longer bleed into adjacent fields.
- Validation: CI green after merge; staging deploy green after merge.


## 2026-03-26

- Engagement: merged PR #430 to add deterministic summary enrichment for integrated timeline items.
- Engagement: timeline items now return `summary` for known event types, improving dashboard readability without changing routes or storage.
- Validation: CI green after merge.
- Staging: initial deploy hit transient Azure trigger-sync failure; manual redeploy succeeded and `/api/version` returned healthy.


## 2026-03-26

- Engagement: merged PR #432 to prefer engagement `data.text` in integrated timeline summaries.
- Engagement: engagement timeline items now return more operator-readable summaries instead of low-value fallbacks like `note.add` when event text is present.
- Validation: CI green after merge; staging deploy green after merge.


## 2026-03-27

- Dashboard: merged PR #434 to map formation event timestamp fallbacks on visitor detail.
- Dashboard: Recent Formation Events now uses happenedAt, occurredAt, recordedAt, createdAt, then timestamp to avoid false "No timestamp available" states.
- Validation: CI green after merge; staging deploy green after merge.





## 2026-04-02

Closed out the visitor summary and formation milestone lane.

Merged:
- #496 feat(api): add visitor summary endpoint
- #498 feat(dashboard): use visitor summary endpoint
- #499 feat(api): add timeline preview to visitor summary
- #500 feat(dashboard): use timeline preview from visitor summary
- #501 feat(api): add formation profile to visitor summary
- #502 feat(dashboard): use formation profile from visitor summary
- #503 feat(api): add formation milestone event types
- #504 feat(api): add milestone flags to visitor summary
- #505 feat(dashboard): show formation milestone badges
- #506 feat(dashboard): add formation milestones column to visitors table (scaffold)
- #507 feat(dashboard): hydrate visitors milestone column from formation profile lastEventType

Result:
- visitor detail is now summary-backed for engagement + formation
- milestone flags are available in visitor summary
- milestone badges render in visitor detail
- milestone column renders in visitors table and is hydrated from formation profile lastEventType

Verification:
- merge to main successful
- CI green
- staging deploy green
- Node 20 deprecation warning on azure/login is resolved; both deploy workflows no longer force the Node 20 action runtime

## 2026-04-06

- 📌 Decision: next backend slice is Journey Read Model.
- Engagement confirmed complete and locked.
- Global integration timeline already implemented.
- Identified remaining gap: auditable journey step tracking (derived from events).
- No code changes yet — docs aligned before implementation.


## 2026-04-06

- ✅ Merged **#523**: followups keyboard flow now supports o to open the outcome editor for the selected row.
- ✅ Merged **#524**: added GET /api/visitors/{visitorId}/journey.
- ✅ Journey state is derived from existing engagement + formation data.
- ✅ No new storage, projections, or write pipeline were added.
- ✅ Added regression coverage for the journey read model.
- ✅ Merged **#525**: added missing Azure Functions metadata for getVisitorJourney (scriptFile + nentryPoint) so runtime discovery works correctly.
- ✅ Verified CI green after both backend PRs.
- ✅ Verified staging deploy green after both backend PRs.

Notes:
- Journey is backend-only at this point and is not yet consumed by visitor summary or dashboard views.
- azure/login Node 20 deprecation warning resolved by using `azure/login@v3`.




## 2026-04-07

- ✅ **#537**: follow-up resolution semantics + needsFollowup fix + assignment cleanup.
- ✅ `followupResolved` now only becomes true once follow-up outcome is recorded.
- ✅ `needsFollowup` now clears correctly when follow-up is resolved.
- ✅ **#538**: follow-up overdue SLA signal added with 48h threshold.
- ✅ **#539**: follow-up urgency tier added (`ON_TRACK`, `AT_RISK`, `OVERDUE`).
- ✅ Follow-up prioritization model extended with:
  - `followupPriorityScore`
  - `followupAgingBucket`
  - `followupEscalated`
- ✅ **#542**: `/ops/followups` priority queue shipped with urgency + scoring + deterministic sorting.
- ✅ **#543**: `/ops/followups` now supports `includeResolved=true` and resolved-aware stats.

### Why this matters
- Backend follow-up behavior is now lifecycle-consistent, SLA-aware, and queryable through a stable ops queue surface.
- Follow-up handling stayed backend-first and did not widen dashboard or journey scope.
- Queue behavior is now regression-covered rather than relying on implicit operator behavior.

### Verification
- ✅ Local regression/invariant suite green before merge.
- ✅ CI green on merged slices.
- ✅ Staging deploy green after merged slices.

### Parked / not shipped
- Teams registry

## 2026-04-08

- ✅ Merged **#545**: added `GROUP_JOINED` formation event with `groups[]` snapshot support and integration summary visibility.
- ✅ Merged **#546**: added `GROUP_LEFT` formation event with group removal support.
- ✅ Formation profile now persists group membership through repo-layer JSON serialization (`groupsJson`) while preserving the domain/API shape as `groups[]`.
- ✅ Added regression coverage:
  - `scripts/assert-integration-summary-groups.ps1`
  - `scripts/assert-integration-group-left.ps1`
- ✅ Verified CI green after both slices.
- ✅ Verified staging deploy green after both slices.

Notes:
- Group membership remains additive/minimal for v1.
- Role-based membership and broader workflow automation remain out of scope for this lane.




## 2026-04-09
- ✅ Merged **#548**: owner rollup
- ✅ Merged **#549**: owner filter regression
- ✅ Merged **#550**: event-derived read model
- CI green
- staging green (rerun)


- ✅ Validated followup ownership model end-to-end (staging + regression); confirmed assign/unassign remain distinct canonical events; no unified setter introduced.\n


## 2026-04-18 22:22 — Dashboard/backend followup alignment shipped

Summary:
- aligned Visitors and Followups to the same backend followup queue semantics
- centralized followup normalization
- moved normalized followup derivation into the loader boundary
- aligned Visitors labels with Followups language
- added Visitors quick filters for My Action Needed, At Risk, and Overdue
- added counts and visual priority styling to those quick filters

Backend / dashboard outcome:
- Visitors and Followups now share one followup source-of-truth model
- followup semantics are normalized once and reused across operator surfaces
- dashboard/operator flow is now materially more consistent and production-safe

Status:
- shipped to production
- build passing
- dashboard/operator flow aligned to current followup queue source of truth

## 2026-04-24 — Backend hardening + assertion enforcement

Completed backend stabilization and regression hardening pass:

- `/ops/followups`
  - owner rollup contract implemented and regression-covered
  - strict owner counters: `total`, `resolved`, `overdue`, `atRisk`, `onTrack`

- `/ops/engagements`
  - create/list/summary behavior verified
  - stale "not implemented" skip paths removed from focused asserts

- `/ops/visitors`
  - create/read/list parity enforced in Express smoke
  - visitor read-after-write is now a required smoke assertion

- Phase 3/4 assertions
  - formation pagination now required
  - formation idempotency now required
  - auth scoping now required
  - integration summary now required
  - formation profiles list checks now strict while avoiding dev-storage paging flakiness

Result:
- backend smoke/assert layer now reflects current implementation truth
- implemented backend behavior should fail loudly instead of silently skipping
- dashboard should remain API-backed and should not invent state models

## 2026-05-08 — Followup semantic stabilization + lifecycle validation

### Summary
Completed the major semantic consistency hardening pass for followup lifecycle behavior.

### Shipped
- Centralized followup projection semantics
- Centralized operator display-name resolution
- Unified dashboard card / queue / visitor detail lifecycle semantics
- Centralized unified timeline semantic wording
- Centralized unified timeline activity classification
- Hardened duplicate suppression using canonical eventId dedupe

### Validation
Validated full staging lifecycle:

assign → contact → unassign → reassign → outcome

Verified:
- queue consistency
- dashboard card consistency
- unified timeline consistency
- normalized operator naming
- resolved followups exiting open queue surfaces

### Outcome
The system now operates with a shared semantic lifecycle layer instead of duplicated surface-specific followup logic.

## 2026-05-08 — Replay and out-of-order validation

### Summary
Validated staging behavior for duplicate replay and stale out-of-order lifecycle events.

### Results
- Duplicate event replay returned accepted=false on the second post.
- Duplicate replay produced one timeline item only.
- Queue state remained stable after replay.
- Late stale assigned/contacted events did not reopen a resolved followup.
- Timeline preserved late events historically while projection state remained resolved.
- Queue remained closed after resolution.

### Outcome
Replay safety and out-of-order lifecycle safety are validated. The project can now shift toward operational hardening.

---

# EOD Replay Integrity Control Plane Closeout (2026-05-09)

Merged + deployed:
- #757 Add OPS formation profile audit repair endpoint
- #758 Align OPS formation audit route surface
- #759 Add filtered OPS formation profile audit listing
- #760 Improve filtered OPS formation audit pagination
- #761 Add OPS formation audit summary metrics
- #762 Expose OPS formation audit scan cap
- #763 Add OPS formation audit staging verification script

Delivered:
- replay-safe formation profile audit primitive
- optional repair capability
- GET single-profile read-only inspection
- bulk audit listing
- drifted=true/false filtering
- bounded filtered scan/fill behavior
- audit summary metrics
- scan cap visibility
- local smoke verification
- deployed staging verification against Azure Functions OPS route surface

Operational state:
- CI green
- staging deploy green
- replay integrity control plane established
- no bulk repair orchestration introduced
- no frontend coupling introduced
- backend-first replay durability maintained


## 2026-05-12 — Timeline + Formation Backend Hardening

### Timeline Pagination + Cursor Stability
- hardened engagement timeline paging regression coverage
- added tie-aware pagination regression assertions
- added newest-first ordering verification under stress
- validated cursor boundary correctness across pages
- validated no-overlap paging behavior under high event volume
- expanded canonical pagination regression gate coverage

### Integration Timeline Stability
- hardened integration timeline paging stress coverage
- expanded integration timeline source fetch windows
- validated occurredAt tie handling across engagement + formation streams
- aligned stress assertions with grouped integration timeline contract
- extracted reusable shared timeline ordering + cursor helpers

### Shared Timeline Infrastructure
- extracted shared timeline ordering utilities
- extracted shared timeline cursor utilities
- extracted shared row-key pagination helpers
- extracted shared offset pagination helpers
- reduced duplicated paging logic across repositories/services

### Formation Projection + Rebuild Reliability
- validated deterministic formation profile rebuild behavior
- validated rebuild idempotency behavior
- validated out-of-order formation event reconciliation
- validated canonical profile reconstruction from raw formation event history

### OPS Followups Reliability
- extracted shared OPS followups queue projection service
- aligned Azure Functions + Express OPS followups contracts
- hardened OPS followups filtering, ordering, and pagination assertions
- added OPS followups lifecycle coverage to canonical regression gate

### Validation
- npm run build
- assert-pagination-regressions.ps1
- assert-formation-profile-reconciliation.ps1
- assert-ops-followups.ps1
- stress-engagement-events-paging.ps1
- stress-integration-timeline-paging.ps1


---

## 2026-05-14 — Orchestration Simulation Control Plane EOD Closeout

### Summary

Completed the deterministic OPS read-only orchestration simulation control-plane contract wave.

### Delivered

- lifecycle/audit simulation contracts
- replay and deterministic hashing contracts
- explainability and anomaly diagnostics
- drift and readiness-transition diagnostics
- export, lineage, multirun, snapshot, and consistency contracts
- governance, policy, compliance, attestation, certification, accreditation, and trust-seal contracts
- assurance, observability, telemetry, intelligence, and analytics contracts

### Operational guarantees preserved

- no orchestration activation
- no task persistence
- no scheduler/timer behavior
- no autonomous mutation
- no orchestration writes
- no storage/history persistence introduced by simulation contracts
- OPS/admin surface only

### Validation

- npm run build
- assert-ops-task-preview-simulation.ps1
- assert-pagination-regressions.ps1
- CI green
- staging deploy green
- staging regression verification green where run

### Outcome

The OPS task-preview simulation surface now acts as a deterministic governance, trust, assurance, observability, intelligence, and analytics control-plane without enabling orchestration itself.


## 2026-05-16 — Canonical Orchestration Infrastructure Closeout

Completed a major deterministic canonical orchestration infrastructure wave.

Added stable replay-safe orchestration substrate layers including:

- canonical unified story contracts
- canonical unified story readers
- canonical semantic enrichment contracts
- canonical semantic enrichment builders
- canonical semantic enrichment composition
- canonical semantic synthesis seams
- canonical deterministic aggregation
- canonical deterministic projection
- canonical deterministic narrative views
- canonical orchestration consumers
- canonical orchestration adapters
- canonical orchestration facades
- canonical orchestration gateways
- canonical orchestration registries

Preserved architectural guarantees throughout the entire orchestration expansion:

- deterministic replay-safe semantics
- transport neutrality
- thin transports
- stable operational ordering
- stable lifecycle semantics
- no AI orchestration
- no autonomous behavior
- no scoring engines
- no queue mutation
- no orchestration activation
- no scheduler introduction
- no replay redesign

Validation outcomes:

- CI remained green
- smoke remained green
- OPS regressions remained deterministic
- staging deployments remained healthy

The platform now contains stable deterministic orchestration infrastructure suitable for future pastoral intelligence systems without enabling behavioral automation.

## 2026-05-25 — Replay/projection hardening regression layer

Completed combined backend hardening slices for deterministic replay and projection safety.

What landed:
- Added deterministic regression suite foundation.
- Added timeline ordering and tie-break coverage.
- Added reconciliation ordering invariant coverage.
- Added delayed/out-of-order event protection tests.
- Added engagement status replay consistency tests.
- Added engagement summary accumulation coverage.
- Added timeline pagination determinism coverage.
- Added global timeline row-key ordering coverage.
- Added formation profile cursor safety coverage.
- Hardened malformed formation profile cursor decoding.
- Expanded `npm run test:regression`.

Validation:
- Regression suite passed.
- TypeScript build passed.
- CI passed on PRs.
- Staging deploys completed successfully.
- Azure OIDC deployment path remained healthy.

Impact:
- Backend replay, pagination, cursor, and projection behavior now has reusable deterministic regression coverage.
- No dashboard scope widened.
- Public API behavior remained stable except for safer malformed cursor handling.

## 2026-05-25 — Operational replay integrity hardening wave

Completed a combined backend hardening wave focused on deterministic replay correctness, projection safety, pagination stability, rebuild parity, and operational audit integrity.

Merged slices:
- #917 deterministic replay regression foundation
- #918 projection pagination + cursor hardening
- #919 replay/projection checklist closeout
- #920 integration projection hardening coverage
- #921 global timeline parity hardening
- #923 rebuild audit + replay gap hardening

What landed:

Replay + ordering hardening
- Added deterministic timeline ordering assertions.
- Added row-key parity ordering coverage.
- Added replay-safe rebuild ordering coverage.
- Added integration merge precedence assertions.
- Added delayed/out-of-order replay protection coverage.

Pagination + cursor safety
- Added deterministic pagination boundary coverage.
- Added cross-stream cursor stability coverage.
- Hardened malformed formation cursor decode behavior.
- Added safe cursor rejection regression coverage.

Projection + rebuild integrity
- Added projection repair parity assertions.
- Added deterministic rebuild snapshot coverage.
- Added replay lag/gap detection assertions.
- Added rebuild idempotency verification coverage.

Integration + parity semantics
- Added grouped activity dedupe invariants.
- Added integration summary determinism coverage.
- Added shadow/global parity invariant coverage.
- Added replay envelope deterministic hashing coverage.

Operational outcomes
- Expanded `npm run test:regression` into a reusable backend replay/projection guardrail layer.
- CI remained green across all hardening PRs.
- Azure OIDC deploy path remained healthy.
- Staging deployments completed successfully after every merge.
- Backend operational replay semantics materially strengthened without widening public API scope.

Strategic impact
- Replay-safe backend behavior is now significantly more regression-protected.
- Projection rebuilds and audit flows are now deterministically validated.
- Timeline ordering/cursor semantics are protected against future drift.
- Backend foundation is safer for future endpoint and orchestration expansion.

## 2026-05-25 — Formation projection kernel extraction wave

Completed a backend architecture wave extracting deterministic formation replay/projection behavior from runtime glue into reusable domain infrastructure.

Merged slices:
- #925 extracted comparable formation projection state helper
- #926 extracted deterministic stage transition helper
- #927 extracted deterministic touchpoint advancement helper
- #928 extracted deterministic followup assignment mutation helper
- #929 extracted deterministic milestone mutation helpers
- #930 extracted deterministic formation mutation dispatcher

What landed:
- Centralized comparable profile state semantics.
- Centralized replay-safe stage advancement policy.
- Centralized replay-safe touchpoint timestamp advancement.
- Extracted followup assignment, outcome, and next-step mutation kernels.
- Added deterministic mutation dispatcher contract and event-to-kernel registry.
- Rewired formation runtime to route through dispatcher infrastructure.
- Expanded replay/projection regression coverage for each extracted kernel.

Impact:
- `_shared/formation.ts` is now closer to orchestration/runtime glue.
- Deterministic replay semantics now live in `src/domain/formation/projection`.
- Future orchestration/runtime activation can reuse explicit replay-safe mutation infrastructure.
- Public API behavior remained unchanged.
- CI and staging deploy stayed green across the full extraction wave.

## 2026-05-29 - Today Cockpit MVP / EOD Update

### Completed

- Promoted the Today cockpit as the primary operator-facing dashboard surface.
- Integrated deterministic backend task preview intelligence into the Today cockpit.
- Added Ready Care, High Escalation, and Suppressed operational metrics.
- Added Ready Care cards sourced from backend preview plans.
- Added direct operator actions from Today:
  - Open Visitor
  - Mark Contacted
  - Record Outcome shortcut to the existing visitor action zone
- Validated the full care workflow end-to-end:
  - assigned followup appears in Today
  - operator opens visitor detail
  - contact can be recorded
  - outcome can be recorded
  - visitor transitions to Resolved
  - attention clears
  - formation/activity timelines update
  - Today queue reprioritizes after completion
- Added lightweight ops/task-preview-summary backend endpoint for dashboard consumption.
- Switched dashboard ops preview proxy to the lightweight summary endpoint.
- Preserved backend-authoritative semantics and kept dashboard frontend thin.
- Completed all implementation through PR-only workflow.

### Known Deferred Item

- Production ops-preview latency remains higher than desired, likely due to Azure Function cold start and/or production table access.
- This is not blocking pilot readiness because the workflow is functionally correct.
- Deeper Azure performance investigation is deferred.

### Current Status

The Today cockpit MVP is functionally complete for pilot-readiness purposes. Operators can now start from Today, identify ready care work, open the visitor, record contact/outcome activity, and confirm the backend state transitions correctly.

### Next Safe Lane

- Continue backend/operator readiness work before additional dashboard polish.
- Keep using Today as the primary operator cockpit.
- Continue replacing legacy dashboard surfaces incrementally.
- Avoid frontend-owned orchestration logic.
- Preserve PowerShell-only implementation workflow and PR-only merge discipline.

## 2026-06-02 — Care Queue Read Model Foundation

Completed a backend care queue read-model wave establishing deterministic care candidate projections and queue intelligence.

Merged slices:
- #1026 care candidate metadata projection
- #1027 classification projection metadata
- #1028 classification contract assertion
- #1029 days-open derived classification
- #1030 recommended action projection
- #1031 care sort score projection
- #1032 queue ordering by sort score
- #1033 queue filters
- #1035 queue summary segments

What landed:

Care candidate projections
- Added carePriority projection.
- Added careAgeBucket projection.
- Added escalationLevel projection.
- Added recommendedCareAction projection.
- Added daysOpen projection.
- Added careSortScore projection.

Deterministic classification
- New → normal / none / review_followup.
- Aging → elevated / review / prioritize_review.
- Stale → urgent / escalate / escalation_review.

Queue behavior
- Queue ordering now uses careSortScore DESC.
- Deterministic tie-breaking preserved.
- Added priority filtering.
- Added age-bucket filtering.
- Added escalation filtering.

Queue summary intelligence
- Added byPriority summary counts.
- Added byAgeBucket summary counts.
- Added byEscalationLevel summary counts.
- Preserved totalCandidates, filteredCount, urgentCount, staleCount, and escalationCount metrics.

Validation
- Added reusable classification contract assertion.
- Expanded derivation contract coverage.
- Expanded queue reader contract coverage.
- Validated local regression suite.
- Validated CI green on all merged slices.
- Validated staging deployment after every merge.

Strategic impact
- Established the backend foundation for a future care queue operator experience.
- Preserved read-model-only architecture.
- No persistence changes.
- No assignment workflow activation.
- No care plan implementation.
- No dashboard coupling.

## 2026-06-02 Care Assignment Command Layer Closeout

Completed a backend care assignment command wave.

Added and deployed:

- POST /api/care/candidates/{visitorId}/assign
- POST /api/care/candidates/{visitorId}/unassign
- POST /api/care/candidates/assign-bulk
- POST /api/care/candidates/unassign-bulk

Validated behavior:

- single assignment updates FormationProfile.assignedTo
- single unassignment clears FormationProfile.assignedTo
- bulk assignment returns per-visitor results
- bulk unassignment returns per-visitor results
- missing visitors are reported per item without failing the whole batch
- assignmentState projects assigned/unassigned
- assignmentBucket projects owned/queue
- candidate detail reflects command updates
- ownership regression validates assigned -> owned and unassigned -> queue

Coverage added:

- endpoint contracts for assign/unassign
- endpoint contracts for bulk assign/bulk unassign
- E2E command contracts for assignment flows
- ownership regression for bulk assign/unassign
- regression runner coverage for assignment route contracts

Merged PRs:

- #1046 single assignment command
- #1047 single unassignment command
- #1048 assignment endpoint contracts
- #1049 assignment command E2E contract
- #1050 assignment route contracts in regression runner
- #1051 bulk assignment command
- #1052 bulk unassignment command
- #1053 bulk route contracts in regression runner
- #1054 bulk assignment ownership regression

No dashboard work, care plans, workflow orchestration, or task-engine work was included.

## 2026-06-03 — Cross-Surface Derivation Hardening Closeout

What landed

- PR #1064 — Ops Followups Projection Consistency
  - Added ops followups projection consistency regression coverage.
  - Wired the assertion into the local backend regression gate.
  - Aligned followup regression scripts with the current operator actor contract.

- PR #1065 — Ops Followups Operator Contracts
  - Added required actorId metadata to legacy ops followup mutation assertions.
  - Replaced legacy synthetic resolution outcomes with canonical terminal outcome semantics.
  - Preserved production behavior while strengthening regression coverage.

- PR #1066 — Cross-Surface Derivation Contracts
  - Added cross-surface derivation regression coverage across Journey, Formation Profile, Visitor Summary, Ops Followups, and Task Eligibility.
  - Wired the new assertion into the local backend regression gate.
  - Confirmed CI and staging deployment green.

Why this matters

- Moves Ops Followups and cross-surface derivation into Regression Protected status.
- Reduces projection drift risk across backend read models before dashboard rebuild work.
- Keeps backend-first pilot readiness moving without widening product scope.

Next

- Journey / Formation projection drift audit.
- Task generation derivation audit.
- Visitor profile invariant expansion.

## 2026-06-04 — Integration Summary Contract Hardening

What landed

- PR #1072 — Harden integration summary cross-surface derivation.
- Added the existing integration summary contract family to the local backend regression gate.
- Updated integration summary assertions for current operator follow-up mutation validation requirements.
- Updated integration summary source ownership assertions to reflect current formation-source semantics.
- Added validation coverage for:
  - assignedTo projection consistency
  - followupReason consistency
  - assignment-only source flags
  - assignment → engagement source transition behavior
  - no-false-followup ownership synthesis
  - late / older event stability

Validation

- Local backend regression suite passed.
- CI build + regression + smoke passed.
- Staging deployment completed successfully.
- No production runtime code changes were required.

Why this matters

- Moves integration summary ownership/source derivation coverage into the default local regression path.
- Reduces drift risk between Formation, Integration Summary, Followups, and related read models.
- Strengthens backend contract protection before dashboard rebuild work.

Next

- Journey / Formation projection drift audit.
- Task generation derivation audit.
- Visitor profile invariant expansion.


## 2026-06-04 — Dashboard convergence closeout (#pending)

Completed a dashboard convergence milestone after backend hardening and production dashboard slices.

Completed dashboard slices:
- Ministry OS dashboard foundation (#133)
- Visitor story experience (#134)
- Unified visitor story timeline (#135)
- Today cockpit v2 (#136)
- People-first directory (#137)
- Formation journey experience (#138)
- Care team workbench (#139)
- Executive ministry pulse (#140)

Outcome:
- Dashboard shifted from legacy/operator-admin surfaces toward ministry-centered workflows.
- Existing backend contracts remained authoritative.
- No backend schema, persistence, orchestration, AI, or care-plan behavior was added.
- Production Vercel deployment was verified after each merged slice.
- Dashboard is now a stronger pilot-ready visibility layer over stabilized backend contracts.

Next direction:
- Keep backend semantics authoritative.
- Continue dashboard work only in tightly scoped slices.
- Do not widen into orchestration, AI guidance, real task persistence, RBAC, or care plans without a concrete product/backend blocker.

## 2026-06-05 - Activity Intelligence / Ministry Opportunity Drilldown Closeout

Completed backend and dashboard convergence for activity intelligence into actionable ministry opportunities.

Shipped:
- Backend activity intelligence now includes formation journey, milestone, cohort, opportunity, and drilldown metadata.
- Executive Ministry Pulse now surfaces formation intelligence, cohort gaps, and ranked Ministry Opportunity.
- Ministry Opportunity cards now link to backend-authoritative drilldown destinations.
- Dashboard segment landing pages now support opportunity drilldowns.
- Formation profile segment filters are now backend-authoritative for:
  - connected-without-next-step
  - next-step-selected-not-completed
  - active-care-without-outcome
  - connected-without-care-owner
- Added lightweight intelligence coverage for formation cohort and opportunity drilldown behavior.

Validation:
- Backend PRs #1078, #1079, #1080, #1081, #1082, #1083 passed CI and deployed to staging.
- Dashboard PRs #144, #145, #147, #148, #149 passed Vercel and deployed to production.
- Live staging validation confirmed `/api/activity-intelligence` and `/api/formation/profiles?segment=connected-without-next-step`.
- Both `hope-ai-api` and `hope-dashboard` ended clean on `main`.

Next:
- Continue moving logic into backend-authoritative contracts.
- Avoid investing in legacy dashboard polish except where needed to bridge toward the new Ministry OS.
- Next high-value slice: richer person-level opportunity worklists and segment-specific UX in the new dashboard path.

## 2026-06-05 - Opportunity Worklists & Visitor Context Closeout

Completed backend and dashboard convergence for person-level ministry opportunity workflows.

Backend

- Added opportunity worklist regression script (#1087).
- Added staging validation coverage for all supported opportunity segments.
- Added backend-authored recommended action reasons (#1088).
- Extended opportunity worklist contracts with:
  - recommendedAction.label
  - recommendedAction.reason
- Preserved backward compatibility during rollout.

Dashboard

- Completed opportunity segment descriptions (#150).
- Added opportunity context banners on visitor detail (#152).
- Added backend action + reason display on visitor detail (#153).
- Added opportunity visitor-context smoke validation (#154).

Validation

- PR #1087 passed CI and deployed successfully.
- PR #1088 passed CI and deployed successfully.
- Staging deployment completed successfully.
- Opportunity worklist regression passed against staging.
- Opportunity-to-visitor-detail context handoff validated.
- Dashboard production deployments verified through Vercel.
- Both repositories ended clean on main.

Outcome

Executive Ministry Pulse now supports:

- Backend Opportunity Ranking
- Opportunity Worklists
- Visitor Detail Handoff
- Backend Recommended Actions
- Backend Recommended Reasons
- Smoke Coverage

Next

- Continue backend-authoritative ministry intelligence.
- Expand person-level opportunity narratives.
- Avoid adding dashboard-owned business logic.


## 2026-06-09 — Pilot Command Surface Validation

### Completed

- Care ownership commands verified end-to-end.
  - Assign candidate
  - Unassign candidate

- Care outcome commands verified end-to-end.
  - FOLLOWUP_OUTCOME_RECORDED

- Journey next-step commands verified end-to-end.
  - NEXT_STEP_SELECTED
  - NEXT_STEP_COMPLETED

- Dashboard mutations now use server-side API proxy routes.

- Engagement event ingestion now requires x-api-key.

### Validation

- Dashboard build passed.
- Backend build passed.
- Dashboard PR #13 merged.
- Dashboard PR #14 merged.
- Dashboard PR #15 merged.
- Dashboard PR #16 merged.
- Backend PR #1092 merged.

### Manual Smoke Results

- Care assignment updates projections.
- Care unassignment updates projections.
- Care outcome updates formation profile.
- Next-step selection updates formation profile.
- Next-step completion updates formation profile.
- Journey evidence updates correctly.
- Engagement ingestion rejects missing API key.
- Engagement ingestion accepts valid API key.

### Pilot Readiness

Verified command workflow chain:

Care Assign
→ Care Unassign
→ Care Outcome
→ Next Step Selected
→ Next Step Completed

All validated against backend projections.



## 2026-06-09 — People Workflow Pilot Readiness

Dashboard work completed against existing signed-off backend contracts.

What landed:
- People profile note creation using POST /visitors/{visitorId}/notes
- People profile visitor creation using POST /visitors
- Full Story timeline view using integration timeline data with summary fallback
- Care ownership assignment/unassignment directly from the People profile
- Journey next-step selection/completion directly from the People profile

Validation:
- All changes merged through PR workflow
- CI passed on all merged PRs
- Vercel preview deployments passed
- Production deployments verified after merge
- Manual workflow validation completed

Result:
- The People page now acts as the primary pastor-facing workflow surface for person-level care and journey actions.

## 2026-06-11 — Dashboard Contract Alignment + Care Guardrails

### Completed

Backend PR #1097 dashboard adoption completed.

Dashboard support added for:

- address1
- address2
- city
- state
- postalCode
- birthday

People workflow enhancements:

- Create Person supports address and birthday
- Edit Person supports address and birthday
- Person Profile displays address and birthday
- Dashboard API proxy routes pass new visitor identity fields through existing backend contracts

Care workflow enhancements:

- Care workspace now surfaces latest follow-up outcome
- Care workspace now surfaces outcome timestamp
- Care workspace now surfaces workflow source metadata from care candidate projections

Backend contract hardening:

- Added care candidate end-to-end assertion for source.followupOutcomeAt
- Extended care candidate projection guardrails without changing runtime behavior

### Validation

Dashboard:

- npm run build passed
- Dashboard PR #27 merged
- Dashboard PR #28 merged
- Vercel preview deployments passed
- Production deployment verified

Backend:

- assert-care-candidates-end-to-end.ps1 passed
- run-local-backend-regression.ps1 passed
- Backend PR #1098 merged
- CI passed
- Staging Azure Functions deployment succeeded

### Result

People, Care, and backend care-candidate projections remain aligned around signed-off backend contracts.

Additional guardrails now verify:

- source.workflowId
- source.followupOutcome
- source.followupOutcomeAt

for needs_care care candidate projections.

### Pilot Readiness

Current pilot workflow coverage includes:

Visitor Creation
→ Person Profile
→ Care Assignment
→ Care Outcome
→ Journey Next Step Selection
→ Journey Next Step Completion

All validated against backend projections and dashboard contract surfaces.

