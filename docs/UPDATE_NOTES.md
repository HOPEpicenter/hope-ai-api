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
- `azure/login@v2` still reports the GitHub Actions Node 20 deprecation warning and remains a tracked follow-up
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
- ✅ OPS: followups items now include esolvedForAssignment so queue logic can suppress “already resolved” rows without adding write endpoints under /ops/*.
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
- Cleanup: removed orphan root function folder opsFollowups/ that caused Core Tools discovery errors (function.json without entrypoint). (PR #198)
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

