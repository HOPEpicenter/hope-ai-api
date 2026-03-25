### 2026-03-25 (Session Closeout)

- [x] Merged **#398**: visitor detail now emphasizes the next operator action.
- [x] Merged **#399**: visitor detail header now surfaces assignee.
- [x] Merged **#400**: resolved visitor action zone now shows a closed-state summary instead of noisy secondary actions.
- [x] Merged **#401**: visitor detail header now surfaces last activity.
- [x] Merged **#402**: visitor detail header now supports unassign quick action.
- [x] Merged **#403**: visitor detail header now supports assign-to-me quick action.
- [x] Merged **#404**: visitor detail header now surfaces needs-attention state.
- [x] Merged **#405**: visitor detail needs-attention chip now links to the action zone.
- [x] Merged **#406**: visitors-table needs-attention badge now links to the needs-attention preset.
- [x] Merged **#407**: visitors-table assignee values now link to ownership presets.
- [x] Merged **#408**: visitors preset context is preserved from list to detail and back.
- [x] Merged **#409**: visitor detail assign/contact/outcome flows now preserve preset context after action.
- [x] Merged **#410**: visitor detail success banners now include a back-to-queue CTA when preset context exists.
- [x] Merged **#412**: visitor detail success banners now expose a `Next visitor` CTA for preset-driven flows.
- [x] Merged **#413**: `Next visitor` now navigates directly to the next visitor within the same preset queue, with queue fallback when needed.
- [x] Merged **#414**: production deploy workflow now uses `Azure/functions-action@v1.5.3`.
- [x] Merged **#416**: visitors-table actions column alignment was polished for inline outcome editing.
- [x] Verified CI passed after merged slices.
- [x] Verified staging deploy passed after merged slices.
- [x] Verified local operator validation passed for queue flow, fallback behavior, no-preset regression, and dashboard smoke routes.
- [x] Verified staging rerun passed after a transient trigger-sync failure on **#416**.
## Session Closeout

### 2026-03-14 (Session Closeout)

- [x] Merged **#330**: staging deploy now uses `func publish --no-build`.
- [x] Merged **#331**: staging workflow installs Azure Functions Core Tools.
- [x] Merged **#332**: staging `func publish` runtime is explicitly set to JavaScript.
- [x] Merged **#333**: removed dead staging zip packaging steps after the deploy-path switch.
- [x] Merged **#334**: inline followup outcome editor moved into the actions column.
- [x] Merged **#335**: integration summary followup logic tightened and aligned with `deriveIntegrationSummaryV1`.
- [x] Merged **#336**: followups actions scanability improved with a needs-attention indicator and grouped row actions.
- [x] Merged **#338**: followups dashboard added a URL-backed needs-attention quick filter.
- [x] Merged **#339**: followups preset active states now reflect the full effective filter state.
- [x] Merged **#340**: followups age summary card active states now reflect the full effective filter state.
- [x] Merged **#341**: the needs-attention preset active state now reflects the full effective filter state.
- [x] Merged **#342**: followups age card presets now clear assignee.
- [x] Merged **#343**: the needs-attention preset now applies a clean preset state.
- [x] Merged **#345**: followups presets and age cards now clear search, and active-state truthfulness now includes search.
- [x] Merged **#346**: row-level age filters now apply a clean state.
- [x] Merged **#347**: row-level queue filters now apply a clean state.
- [x] Merged **#348**: row-level stage filters now apply a clean state.
- [x] Merged **#349**: row-level outcome and assignee filters now apply a clean state.
- [x] Verified CI passed after merged slices.
- [x] Verified staging deploy passed and `/api/version` returned 200.

### 2026-03-12 (Session Closeout)

- [x] Merged PR #300: followups active filter chips + clear-all control
- [x] Merged PR #301: clickable 24h+/48h+/72h+ aging summary cards
- [x] Verified CI passed after both merges
- [x] Verified staging deploy passed after both merges

### 2026-03-07 (session closeout)

- [x] Merged **#245**: integration summary follow-up invariants.
- [x] Merged **#246**: assignment-only integration summary source-flag invariant.
- [x] Merged **#247**: integration summary source transition invariant.
- [x] Merged **#248**: formation snapshot tie-break invariant.
- [x] Merged **#249**: formation idempotency assert wired into `scripts/regression.ps1`.

### 2026-03-06 (session closeout)

- [x] Fixed staging auth parity for `POST /api/formation/events` by changing the Functions HTTP output binding from `"$return"` to `"res"` (merged in **#227**).
- [x] Verified staging behavior: unauthenticated `POST /api/formation/events` => `401`.
- [x] Verified `scripts/assert-auth-scoping.ps1` passes on staging.
- [x] Verified `scripts/regression.ps1` passes end-to-end on staging.

### 2026-02-28 (Session Closeout)

- Merged PR #165: GET /api/visitors list endpoint + CI smoke alignment
- Merged PR #166: remove duplicate email reservation block
- Merged PR #167: deterministic visitors list ordering (updatedAt desc)
- Confirmed CI auth scoping expectations run (assert-auth-scoping.ps1)

# HOPE AI API Master Checklist (Product + Engineering)

> Single source of truth for what’s built, what’s locked, and what’s next.
> Update this file in the same PR as any change that materially affects behavior or contracts.

## Current state

- Repo status: merge to `main` via PR only; keep CI green.
- This checklist is implementation-focused; `docs/MASTER_PLAN.md` is the phase truth source.
- After any behavior/contract change: update BOTH this file and `docs/MASTER_PLAN.md`.

---

## Phase 1 — Identity (LOCKED / COMPLETE)

### Product outcomes
- [x] Canonical visitorId as the stable identifier for a person.
- [x] Visitor creation is idempotent by normalized email (trim + lowercase).

### Engineering / contracts
- [x] Public create visitor: POST /api/visitors (#199)
  - Returns 201 when created; 200 when reused (idempotent repeat).
  - Always returns { ok: true, visitorId } on success.
- [x] Public get visitor: GET /api/visitors/:id (#200)
- [x] Validation: missing email => 400; invalid email => 400.

### Storage invariants (Azure Table Storage)
- [x] VISITOR entity: PartitionKey="VISITOR", RowKey=visitorId
- [x] EMAIL index entity: PartitionKey="EMAIL", RowKey=encodeURIComponent(emailLower) => { visitorId }
- [x] Stale EMAIL index repair:
  - If EMAIL index points to missing visitor, recover VISITOR by emailLower, repair index, return existing visitor.

### Tests
- [x] Smoke coverage:
  - [x] Public create idempotency (same email returns same visitorId)
  - [x] Stale EMAIL index regression (corrupt index -> API repairs -> returns same visitorId)
  - [x] Public get visitor
  - [x] Public create missing email => 400

### Change log / references
- [x] PR #68 merged: stale EMAIL index delete+retry + docs for 200/201 behavior
- [x] PR #69 merged: recover-by-emailLower + smoke regression for stale EMAIL index

---

## Phase 2 — Engagement (LOCKED / COMPLETE)

### Product outcomes
- [x] Engagement events are stable-contract and ministry-safe (envelope locked).
- [x] Timeline read contract is stable (cursor paging + ordering).
- [x] Status transitions are auditable (event-driven preferred).
- [x] Notes + tags v1 (ministry-friendly).
- [x] Engagement score (derived, not stored).
### Engineering (already present / verified by smoke)
- [x] Public engagement append works: POST /api/engagements/events
- [x] Public engagement timeline works: GET /api/engagements/timeline
- [x] Public engagement score works: GET /api/engagements/score
- [x] Public engagement status works: GET /api/engagements/status
- [x] Append event endpoint exists and works: POST /ops/visitors/:id/events
- [x] Dashboard endpoint exists and works: GET /ops/visitors/:id/dashboard
- [x] Timeline paging works (nextCursor + page2).
- [x] Oversized metadata protection returns 400.
- [x] 404 JSON includes requestId (verified in smoke).

### Phase 2 — Next PR-sized tasks (choose 1 at a time)
- [x] Lock “Engagement event envelope v1” in one place (validate + normalize consistently).
- [x] Lock “Timeline read contract v1” (cursor paging, stable ordering, consistent limits).
- [x] Model “Status transitions v1” as events (preferred) or dedicated stream.

---

## Phase 3 — Formation (ACTIVE / PARTIALLY COMPLETE)
- [x] Milestone derivation regression assert exists (scripts/assert-formation-milestones-v1.ps1)
- [x] Formation stage model contract exists (FormationStage + stage fields on profile snapshot)
- [x] Protected formation append works: POST /api/formation/events (x-api-key required)
- [x] Public formation list works (paging): GET /api/visitors/:id/formation/events
- [x] Public formation profile snapshot works: GET /api/visitors/:id/formation/profile
- [x] Regression/assert coverage now includes formation milestones v1, snapshot invariants, tie-break behavior, and idempotency
- [x] Define formation milestones/events and derivations (docs/formation-milestones-v1.md + assert script)
- [ ] Track journey steps in an auditable way (prefer derive from events) — defer unless a real producer/blocker requires it.

## Cross-cutting — Auth scoping (COMPLETED)

- Protected endpoints are enforced via API key middleware:
  - `/api/formation/timeline`
  - `/api/integration/timeline`
  - `/api/legacy/export`
  - `/api/formation/events`
- Expected behavior:
  - No API key => 401
  - With API key but missing required query/invalid body => 400
- Verification:
  - `scripts/assert-auth-scoping.ps1` passes
  - `scripts/regression.ps1` passes through auth scoping
  - CI/local assertions cover current scoped endpoint expectations
- Remaining:
  - Extend assertions only when new protected surfaces are added.

---

## Phase 4 — Integration (ACTIVE / PARTIALLY COMPLETE)

- [x] `/api/integration/timeline` v1 aggregation exists (protected)
- [x] Cursor contract exists (`integrationTimelineCursor.v1` base64url JSON round-trip)
- [x] Deep paging + cursor translation hardened at integration layer
- [x] Cross-stream cursor boundary regression coverage exists
- [x] `/api/integration/summary` v1 exists (read-only derived view)
- [x] Gated assert exists for integration summary (`scripts/assert-integration-summary.ps1`)
- [x] Consistency hardening: integration timeline reads formation via storage repo (cursor decode + perStream+1 tail slice paging)
- [x] Regression covers integration summary ownership/source invariants (follow-up consistency, assignment-only source flags, assignment→engagement transition, no-false-followup, late/older-event stability)

Remaining (business logic expansion):
- [x] Define cross-stream ordering contract (explicitly documented)
- [x] Define aggregation model (engagement + formation merge rules) (docs/integration-aggregation-model-v1.md)
- [x] Model ownership / follow-up assignments (docs/ownership-followup-model-v1.md)
- [x] Connect people to groups / programs / workflows (docs/groups-programs-workflows-model-v1.md)
---
## Phase 5 — Legacy (NOT STARTED)
- [ ] Long-horizon outcomes and history views.
- [ ] Derived insights (avoid storing derived state unless necessary).

---

## Guardrails (always)
- Keep smoke green and CI green.
- No direct pushes to main; PRs only.
- Focus: only changes that prevent major issues later or advance the master plan.

### 2026-02-25 (session closeout)

- ✅ CI: use HOPE_API_KEY GitHub secret with safe fallback (ci-key) — merged in **#140**
- ✅ Storage: make ensureTableExists idempotent across Azurite races — merged in **#141**
- ✅ Tests: regression runner includes integration summary followupReason/assignedTo consistency contract (gated on HOPE_API_KEY) — merged in **#139**
- 🧹 Hygiene: closed stale bundled CI PRs (#2–#5); kept only minimal safe changes


### 2026-02-27 (session closeout)

- [x] OPS followups: ensure formation profiles table exists before listing (fresh Azurite doesn't 500).
- [x] OPS followups: include resolvedForAssignment in response items (queue consumer can filter resolved rows).
- [x] Dev discipline maintained: OPS remains read/projection; writes stay in formation events (/api/formation/events).
### 2026-03-10 (session closeout)

- [x] Merged **#264**: dashboard visitors page wired to real visitors endpoint.
- [x] Merged **#265**: dashboard visitor detail page wired to real visitor endpoints.
- [x] Merged **#266**: dashboard overview page wired to real dashboard loaders.
- [x] Merged **#267**: dashboard shell layout polish with sidebar navigation.
- [x] Merged **#268**: shared dashboard loading / empty / error page states.
- [x] Merged **#271**: dashboard relative timestamps across visitors, detail, followups, and timeline.
- [x] Merged **#272**: dashboard sort order polish for freshness and operator urgency.
- [x] Merged **#273**: dashboard empty state messaging polish.
- [x] Merged **#274**: dashboard copy and label polish.
- [x] Merged **#275**: clarified Formation stage metadata docs contract.


## Followups dashboard closeout — synced 2026-03-17

Completed after prior followups doc sync:
- [x] #353 unify followup outcome row actions
- [x] #358 polish followup row visuals
- [x] #361 add keyboard outcome entry shortcuts
- [x] #362 harden followup row action re-entry guards
- [x] #363 harden followup outcome action guard parity

Current state:
- [x] row-action outcome workflow unified
- [x] row-action keyboard affordances shipped
- [x] row-action re-entry guards shipped
- [x] outcome action guard parity shipped

## Dashboard v1 release closeout — 2026-03-17

- [x] Overview shipped
- [x] Follow-Ups shipped
- [x] Visitors shipped
- [x] Visitor Detail shipped
- [x] Timeline shipped
- [x] Dashboard foundation complete on main
- [x] Followups dashboard closeout synced
- [x] CI green on main
- [x] Staging deploy green on main
- [x] Dashboard v1 marked release-ready

Post-v1 rule:
- [x] Defer workflow automation / reminders / journey-step expansion unless a real blocker requires them
- [x] Treat additional dashboard work as new explicitly scoped slices

## Phase 3/4 closeout sync — 2026-03-17

- [x] Phase 3 Formation surface implemented
- [x] Phase 3 formation milestones v1 doc/assert present
- [x] Phase 3 regression coverage wired
- [x] Phase 4 Integration surface implemented
- [x] Phase 4 integration summary invariants asserted
- [x] Phase 4 regression coverage wired
- [x] Docs synced to current Phase 3/4 surface
- [x] CI green on main
- [x] Staging deploy green on main
- [x] Current Phase 3/4 surface treated as closed unless a real blocker appears

## Dashboard v1.1 operator-flow slices - 2026-03-25

- [x] Visitor detail next-action emphasis shipped
- [x] Visitor detail header ownership/freshness/attention signals shipped
- [x] Visitor detail header assign/unassign quick actions shipped
- [x] Visitor detail attention chip now links to action zone
- [x] Visitors-table needs-attention badge now links to the needs-attention preset
- [x] Visitors-table assignee values now link to ownership presets
- [x] Visitors preset context is preserved through list -> detail -> back
- [x] Visitor detail action success flow now provides a back-to-queue CTA
- [x] Visitor detail success flow now exposes a `Next visitor` CTA for preset-driven work
- [x] `Next visitor` now navigates directly within the same preset queue with queue fallback
- [x] Visitors-table actions column alignment now supports cleaner inline outcome editing

Current rule:
- [x] Treat the current dashboard v1.1 operator-flow work as complete unless a real blocker appears
- [x] Do not widen backend scope unless a real blocker appears
- [ ] Follow up later on `azure/login@v2` GitHub Actions Node 20 deprecation warning in deploy workflows

