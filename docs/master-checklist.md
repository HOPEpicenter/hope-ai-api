## 2026-07-07 — Editable Pastoral Notes Backend

- [x] Stable pastoral note IDs added.
- [x] `note.updated` engagement event contract added.
- [x] Canonical pastoral notes projection added.
- [x] Single-note canonical lookup added.
- [x] `GET /api/visitors/{visitorId}/notes` added.
- [x] `PATCH /api/visitors/{visitorId}/notes/{noteId}` added.
- [x] Version history and edited metadata preserved through replay.
- [x] Full lifecycle regression covers POST -> GET -> PATCH -> GET.
- [x] Duplicate engagement Global Timeline append removed.

Current rule:
- dashboard note editing must consume the backend notes contracts.
- pastoral notes remain event-sourced and audited, not destructive row updates.
- staff administration remains the next backend-managed directory gap.
## 2026-05-19 Ordering governance consolidation

- [x] Centralized followups queue comparison helpers
- [x] Unified canonical timeline newest-first ordering usage
- [x] Removed redundant legacy export re-sorting
- [x] Aligned formation timeline retrieval with shared ordering semantics
- [x] Added rowKey-aware tie-break support to shared timeline ordering helpers
- [x] Centralized preview ordering comparator semantics
## 2026-05-19 Projection integrity + pagination hardening

- [x] Canonical dashboard contract extraction completed
- [x] Canonical snapshot contract extraction completed
- [x] Canonical narrative typing hardening completed
- [x] Followups cursor replay regression coverage enforced
- [x] Followups pagination boundary regression coverage enforced
- [x] Projection integrity orphan exclusion assertions enforced
- [x] Formation projection repair steady-state assertions enforced



## 2026-05-27 Runtime Governance Maintainability

- [x] Canonical governance regression coverage hardened
- [x] Replay observability telemetry centralized
- [x] Runtime verification governance state centralized
- [x] Policy/compliance/attestation verification state converged
- [x] Runtime simulation governance summary segmented
- [x] Runtime simulation policy summary segmented
- [x] Runtime simulation compliance summary segmented
- [x] Runtime simulation attestation summary segmented
- [x] CI validation passed
- [x] Regression validation passed
- [x] Staging deployment validation passed

Current rule:
- keep orchestration activation out of scope
- preserve replay-safe deterministic runtime behavior
- prefer EOD documentation batching unless a docs branch is already open
## 2026-05-26 Replay + Projection Governance Convergence

- [x] Canonical replay resilience governance
- [x] Canonical runtime alias governance
- [x] Canonical projection integrity governance
- [x] Canonical projection metadata governance
- [x] Canonical replay lineage governance
- [x] Canonical replay envelope governance
- [x] Centralized diagnostic projection classification
- [x] Centralized replay lineage consistency semantics
- [x] Centralized deterministic replay envelope semantics
- [x] Replay regression coverage expansion
- [x] Azure Functions deploy workflow stabilization (Node 22 alignment)
- [x] CI validation passed
- [x] Regression validation passed
- [x] Staging deployment validation passed

Current governance rule:
- continue converging replay/projection semantics onto canonical shared infrastructure
- preserve deterministic replay-safe behavior
- avoid orchestration/runtime activation expansion
- keep backend governance correctness prioritized over dashboard expansion
## 2026-04-24 Backend hardening closeout

- [x] `/ops/engagements` create/list/summary required and covered by focused assertions — #687, #692
- [x] `/ops/followups` owner rollup implemented and regression-covered — #688
- [x] `/ops/visitors` create/read/list parity enforced in Express smoke — #689, #690, #691, #697
- [x] Phase 3 formation pagination gate enforced — #693
- [x] Phase 3 formation idempotency gate enforced — #694
- [x] Phase 3 auth scoping gate enforced — #695
- [x] Phase 4 integration summary gate enforced — #696
- [x] Formation profiles list checks enforced without dev-storage paging flakiness — #698
- [x] Stale backend `SKIP:` paths removed; remaining engagement E2E skip is local secret-gated only.

### 2026-04-01 — Global unified timeline

- [x] #490 global integration timeline endpoint
- [x] GET /api/integration/timeline/global implemented
- [x] Cursor + limit paging supported
- [x] Verified CI green
- [x] Verified staging deploy green
- [x] Verified dashboard proxy returns data


### 2026-03-29 — Formation truth lane

- [x] #451 formation profile parity
- [x] #452 engagement → formation bridge
- [x] #453 profile response normalization
- [x] #454 profiles list normalization
- [x] #455 backfill script (PowerShell)
- [x] #456 assignedTo normalization
- [x] #457 regression asserts



### 2026-03-27 (Session Closeout)

- [x] Merged **#438–#444**: dashboard readability and scanability polish across timeline and visitors table
- [x] Timeline:
  - removed event ID noise
  - softened fallback copy
  - improved wrapping, spacing, and timestamp clarity
- [x] Visitors table:
  - compacted visitor ID cell with inline copy action
  - softened empty-cell placeholders
  - improved truncation and row density
- [x] Verified CI passed after merged slices
- [x] Verified staging deploy passed after merged slices


### 2026-03-26 (Session Closeout)

- [x] Merged **#422**: visitors search now supports visitor ID lookup.
- [x] Merged **#422**: visitors table overflow/layout issue fixed for email, visitor ID, copy action, and last activity.
- [x] Merged **#423**: overview upgraded into a practical operator triage page.
- [x] Verified dashboard staging on Vercel for `/overview` and `/visitors`.
- [x] Confirmed Timeline remains deferred intentionally until a real blocker or consumer appears.

### 2026-03-26 (Session Closeout)

- [x] Merged **#420**: dashboard followups loader now uses `GET /api/formation/profiles?limit=200` instead of `/ops/followups`.
- [x] Verified dashboard staging works against the API-only Azure Functions host.
- [x] Verified remote pages load on staging: `/overview`, `/followups`, `/visitors`, `/timeline`.
- [x] Verified `scripts/run-smoke-remote.ps1` passed against `https://hope-ai-api-staging.azurewebsites.net`.
- [x] Confirmed dashboard followups no longer depend on `/ops/*`.
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
- [x] Track journey steps in an auditable way (derived from events, read-only) — COMPLETE (2026-04-06, #524).

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
- [x] Long-horizon outcomes and history views — satisfied by cursor-paged integration/global timelines plus legacy export payload v1.
- [x] Derived insights — satisfied by existing read-only derived score, risk, activity, journey, and integration insight surfaces.

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
- [x] Resolve `azure/login` GitHub Actions Node 20 deprecation warning by using `azure/login@v3` in deploy workflows




- [x] Add visitor-scoped engagement timeline endpoint (`GET /api/engagements/{visitorId}/timeline`)
- [x] Add regression coverage for integrated visitor timeline (engagement + formation)
- [x] Verify CI green after merge
- [x] Verify staging deploy green after merge


- [x] Show integrated visitor engagement timeline on dashboard visitor detail
- [x] Normalize assigned owner display on visitor detail
- [x] Fix long email wrapping/layout on visitor detail
- [x] Verify CI green after merge
- [x] Verify staging deploy green after merge


- [x] Add deterministic summary enrichment for integrated timeline items
- [x] Verify CI green after merge
- [x] Verify staging healthy after redeploy


- [x] Prefer engagement event text in integrated timeline summaries
- [x] Verify CI green after merge
- [x] Verify staging deploy green after merge


- [x] Map formation event timestamp fallbacks on visitor detail
- [x] Verify CI green after merge
- [x] Verify staging deploy green after merge







## 2026-04-02 Session Closeout - Visitor Summary + Formation Milestones

- [x] Visitor summary endpoint added
- [x] Dashboard visitor detail moved to visitor summary
- [x] Timeline preview added to visitor summary
- [x] Dashboard visitor detail consumes summary timeline preview
- [x] Formation profile added to visitor summary
- [x] Dashboard visitor detail consumes summary formation profile
- [x] Formation milestone event types added end-to-end:
  - [x] SALVATION_RECORDED
  - [x] BAPTISM_RECORDED
  - [x] MEMBERSHIP_RECORDED
- [x] Milestone flags added to visitor summary
- [x] Visitor detail milestone badges shipped
- [x] Visitors table milestone column scaffold shipped
- [x] Visitors table milestone column hydrated from formation profile lastEventType
- [x] Main merged cleanly
- [x] CI green
- [x] Staging deploy green
- [x] azure/login Node 20 deprecation warning fully resolved; obsolete Node 20 action runtime overrides removed from deploy workflows


## 2026-04-06 Session Closeout

- [x] Merged **#523**: followups keyboard flow now supports o to open the outcome editor for the selected row.
- [x] Merged **#524**: added GET /api/visitors/{visitorId}/journey.
- [x] Journey read model is derived from existing engagement + formation truth.
- [x] No new storage, projections, or write pipeline added.
- [x] Added regression coverage for visitor journey.
- [x] Merged **#525**: added missing Azure Functions metadata for getVisitorJourney.
- [x] Verified CI green.
- [x] Verified staging deploy green.


### 2026-04-07 shipped follow-up / ops queue sync
- [x] Follow-up resolution semantics aligned (`followupResolved`, `needsFollowup`, assignment cleanup) — #537
- [x] Follow-up overdue SLA signal (48h) — #538
- [x] Follow-up urgency tier (`ON_TRACK` / `AT_RISK` / `OVERDUE`) — #539
- [x] Follow-up prioritization signals shipped (`followupPriorityScore`, `followupAgingBucket`, `followupEscalated`)
- [x] `/ops/followups` priority queue shipped — #542
- [x] `/ops/followups` includeResolved + resolved stats shipped — #543
- [x] Teams registry v1 — read-only /ops/teams endpoint shipped in #999 and regression-covered in #1000
- [x] Ops followups owner rollup — #548
## 2026-04-08 Session Closeout

- [x] Merged **#545**: add `GROUP_JOINED` event with formation snapshot + integration summary support
- [x] Merged **#546**: add `GROUP_LEFT` event with group removal support
- [x] Persist group membership through repo JSON boundary (`groupsJson`)
- [x] Added regression for integration summary group visibility
- [x] Added regression for group removal
- [x] Verified CI green
- [x] Verified staging deploy green




## 2026-04-09 Session Closeout
- [x] #548 owner rollup
- [x] #549 owner filter regression
- [x] #550 event-derived read model
- [x] CI green
- [x] staging green
- [x] Teams registry v1 — read-only /ops/teams endpoint shipped in #999 and regression-covered in #1000 (parked)


- [x] Followup ownership model validated (assign/unassign lifecycle + regression + staging)\n

## 2026-04-18 — Dashboard followup alignment closeout

- [x] Align Visitors and Followups to shared followup queue semantics
- [x] Centralize followup normalization
- [x] Move normalized followup derivation into loader boundary
- [x] Align Visitors labels with Followups terminology
- [x] Add Visitors quick filters: My Action Needed, At Risk, Overdue
- [x] Add counts to Visitors quick filters
- [x] Add visual priority styling to Visitors quick filters
- [x] Verify local production build passes
- [x] Deploy latest dashboard changes to production

## GLOBAL TIMELINE (COMPLETED CORE)

- [x] Global timeline store created
- [x] Formation events written to global store
- [x] Engagement events written to global store
- [x] Shadow read implemented
- [x] Shadow parity validated (debugShadow)
- [x] Cursor-based pagination working
- [x] Tie ordering validated via asserts
- [x] Visitor timeline protected from global shadow reads
- [x] Global endpoint:
      GET /api/integration/timeline/global


## ENGAGEMENT INTELLIGENCE (COMPLETED)

- [x] Add engagement risk / drift endpoint
- [x] Add shared engagement risk reader
- [x] Surface engagement risk in visitor summary
- [x] Surface risk + priority in dashboard card
- [x] Add shared followup priority helper
- [x] Enrich ops followup queue with engagement risk
- [x] Sort followup queue using engagement risk before legacy SLA score
- [x] Add regression assert for engagement risk
- [x] Add regression assert for visitor risk surface
- [x] Add regression assert for followup priority surface
- [x] Add regression assert for followup queue priority
- [x] Backend hardening closeout complete: unified runner self-contained, ops followups normalized, Engagement E2E skip removed — #700-#704

### 2026-05-08 — Lifecycle consistency + semantic normalization

- [x] Shared followup projection layer aligned across queue, dashboard card, and visitor detail
- [x] Shared operator display-name normalization implemented
- [x] Unified timeline semantic wording centralized
- [x] Unified timeline activity classification centralized
- [x] Timeline duplicate suppression hardened using canonical eventId dedupe
- [x] Validated assign → contact → unassign → reassign → outcome lifecycle on staging
- [x] Verified resolved followups correctly exit open queue surfaces
- [x] Verified queue/dashboard/timeline semantic alignment after reassignment
- [x] Validate duplicate replay/idempotency edge cases
- [x] Validate delayed/out-of-order event handling
- [x] Validate stale projection recovery behavior

### 2026-05-08 — Replay and out-of-order validation

- [x] Duplicate eventId replay returned accepted=false
- [x] Duplicate replay did not create duplicate timeline entries
- [x] Duplicate replay did not corrupt queue state
- [x] Out-of-order stale contacted event did not reopen resolved state
- [x] Out-of-order stale assigned event did not reopen resolved state
- [x] Timeline preserved stale events as historical records
- [x] Resolved projection state remained authoritative
- [x] Begin operational hardening review — completed through health, replay, audit, repair, diagnostics, observability, telemetry, and regression review

---

## Replay Integrity Control Plane Checklist (Completed)

- [x] deterministic reconciliation ordering helpers
- [x] reusable formation projection application helper
- [x] replay-safe formation profile derivation
- [x] single visitor rebuild primitive
- [x] OPS audit/repair endpoint
- [x] GET read-only audit inspection endpoint
- [x] bulk formation audit listing
- [x] drift filtering support
- [x] bounded filtered scan/fill behavior
- [x] audit summary metrics
- [x] scan cap visibility
- [x] local smoke verification
- [x] deployed staging verification
- [x] CI validation
- [x] staging deployment validation


---

## 2026-05-14 — Orchestration Simulation Control Plane Closeout

- [x] Added deterministic lifecycle/audit simulation contracts
- [x] Added deterministic replay, hash, and lineage semantics
- [x] Added deterministic explainability, diagnostics, drift, export, multirun, snapshot, and consistency semantics
- [x] Added deterministic governance, policy, compliance, attestation, certification, accreditation, and trust-seal semantics
- [x] Added deterministic assurance, observability, telemetry, intelligence, and analytics semantics
- [x] Preserved OPS-only boundary
- [x] Preserved read-only simulation behavior
- [x] Preserved no task persistence / no scheduler / no orchestration activation guarantees
- [x] Verified CI green during merged PR wave
- [x] Verified staging deploy green during merged PR wave
- [x] Verified local regression gates during implementation
- [x] Existing orchestration simulation regression confirms next orchestration-related work remains simulation-only unless a separate activation design is explicitly opened


## 2026-05-16 — Canonical Orchestration Infrastructure Closeout

- [x] Added canonical unified story contracts
- [x] Added canonical unified story readers
- [x] Added canonical semantic enrichment contracts
- [x] Added canonical semantic enrichment builders
- [x] Added canonical semantic enrichment composition
- [x] Added canonical semantic synthesis seams
- [x] Added canonical deterministic aggregation
- [x] Added canonical deterministic projection
- [x] Added canonical deterministic narrative views
- [x] Added canonical orchestration consumers
- [x] Added canonical orchestration adapters
- [x] Added canonical orchestration facades
- [x] Added canonical orchestration gateways
- [x] Added canonical orchestration registries
- [x] Preserved deterministic replay-safe orchestration semantics
- [x] Preserved transport neutrality
- [x] Preserved thin transport architecture
- [x] Preserved stable OPS regression behavior
- [x] Preserved healthy staging deployment behavior
- [x] Preserved no orchestration activation guarantees
- [x] Preserved no autonomous orchestration guarantees

Next constraints:

- [x] Existing orchestration simulation regression confirms orchestration behavior remains deterministic and read-side only
- [x] Existing orchestration simulation regression preserves no-AI-orchestration/no-activation guardrails
- [x] Existing orchestration simulation regression preserves replay-safe operational semantics


- [x] Existing orchestration simulation regression covers deterministic replay parity/hash snapshot behavior

- [x] Extract deterministic formation projection kernel infrastructure

## Today Cockpit MVP Checkpoint

- [x] Today promoted as primary operator cockpit.
- [x] Deterministic task preview intelligence integrated.
- [x] Ready Care cards render from backend preview plans.
- [x] Open Visitor action available from Today.
- [x] Mark Contacted action available from Today.
- [x] Record Outcome shortcut available from Today.
- [x] End-to-end care loop validated through resolved followup state.
- [x] Lightweight task preview summary endpoint added.
- [x] Dashboard ops preview proxy switched to summary endpoint.
- [ ] Production ops-preview latency investigation deferred.

## 2026-06-02 — Care Queue Read Model Foundation

- [x] Care candidate projection contract
- [x] Care classification projection
- [x] Days-open derivation
- [x] Recommended action derivation
- [x] Care sort score projection
- [x] Queue ordering by sort score
- [x] Queue filtering by classification
- [x] Queue summary metrics
- [x] Queue summary segmentation
- [x] Classification regression coverage
- [x] Queue reader regression coverage
- [x] Staging validation completed

Next constraints:

- [ ] Assignment workflow remains deferred
- [ ] Care plan workflow remains deferred
- [ ] Dashboard implementation remains deferred
- [ ] Persistence model remains deferred

## Care Assignment Command Layer

- [x] Single candidate assignment command deployed.
- [x] Single candidate unassignment command deployed.
- [x] Bulk candidate assignment command deployed.
- [x] Bulk candidate unassignment command deployed.
- [x] Assignment route contracts added.
- [x] Bulk assignment route contracts added.
- [x] Assignment command E2E coverage added.
- [x] Bulk ownership regression coverage added.
- [x] Assignment route contracts wired into regression runner.
- [x] Bulk assignment route contracts wired into regression runner.

## 2026-06-03 Backend Hardening Closeout

- [x] Ops followups projection consistency protection — #1064
- [x] Ops followups operator contract protection — #1065
- [x] Cross-surface derivation contract protection — #1066
- [x] Journey / Formation / Visitor Summary derivation validation
- [x] Ops Followups derivation validation
- [x] Task Eligibility derivation validation
- [x] Journey / Formation projection drift audit — COMPLETE (#1124)
- [x] Task generation derivation audit — COMPLETE (#1125)
- [x] Visitor profile invariant expansion — COMPLETE (#1126)

## Dashboard convergence closeout — 2026-06-04

- [x] Ministry OS dashboard foundation merged.
- [x] Visitor story experience merged.
- [x] Unified visitor story timeline merged.
- [x] Today cockpit v2 merged.
- [x] People-first directory merged.
- [x] Formation journey experience merged.
- [x] Care team workbench merged.
- [x] Executive ministry pulse merged.
- [x] Production Vercel deployments verified after dashboard slices.
- [x] Dashboard remains a thin ministry surface over backend-authoritative contracts.

## 2026-06-05 Activity Intelligence / Ministry Opportunity Drilldown Checkpoint

- [x] Add activity intelligence formation journey signals.
- [x] Add activity intelligence formation milestone signals.
- [x] Add activity intelligence formation cohort signals.
- [x] Add ranked ministry opportunity intelligence.
- [x] Add backend-authoritative opportunity drilldown metadata.
- [x] Surface formation intelligence and opportunities in Executive Ministry Pulse.
- [x] Make Ministry Opportunity cards clickable.
- [x] Add v1 dashboard segment landing behavior.
- [x] Add backend-authoritative formation profile segment filters.
- [x] Update dashboard formation segment drilldowns to pass through backend segment contracts.
- [x] Add lightweight formation segment intelligence coverage.

## 2026-06-05 Opportunity Intelligence Worklist Closeout

- [x] Opportunity worklist endpoint deployed.
- [x] Opportunity worklist regression script added.
- [x] Opportunity worklist staging validation completed.
- [x] Opportunity drilldown landing pages completed.
- [x] Opportunity context banner added to visitor detail.
- [x] Backend-authored recommended action reasons added.
- [x] Visitor detail displays backend action context.
- [x] Visitor detail displays backend reason context.
- [x] Opportunity visitor-context smoke coverage added.
- [x] Production dashboard deployment verified.
- [x] Staging backend deployment verified.
- [x] Opportunity intelligence remains backend-authoritative.

Next constraints

- [x] Journey / Formation projection drift audit — COMPLETE (#1124).
- [x] Task generation derivation audit — COMPLETE (#1125).
- [x] Visitor profile invariant expansion — COMPLETE (#1126).
- [x] Canonical opportunity narrative layer — COMPLETE (#1128).


## 2026-06-09 People Workflow Pilot Readiness

- [x] Visitor creation from People page
- [x] Visitor notes from People profile
- [x] Full Story timeline from backend timeline contract
- [x] Care ownership actions from People profile
- [x] Journey next-step actions from People profile
- [x] CI validation passed
- [x] Vercel preview validation passed
- [x] Production deployment validation passed

Current rule:
- onboard real ministry data before widening dashboard scope
- use People as the primary pastor workflow surface
- continue backend-first governance discipline

## 2026-07-07 — Staff Identity v1

- Added canonical Staff Identity v1 abstraction over existing operator assignment IDs.
- Preserved backward-compatible operator exports for existing care/followup code.
- Care assignment now rejects unknown `assignedTo` values instead of accepting arbitrary strings.
- Staff Directory API remains future work; this PR only locks the identity boundary needed before dynamic staff administration.

Current rule:
- assignment ownership must resolve through canonical staff identity before future dashboard/staff-admin expansion.

### Staff Directory Read Contract v1
- [x] Protected read endpoint
- [x] Canonical Staff Identity registry
- [x] Regression coverage
- [ ] Dynamic staff persistence
- [ ] Staff administration commands
