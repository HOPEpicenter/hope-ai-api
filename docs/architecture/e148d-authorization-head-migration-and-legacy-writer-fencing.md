# STEP 156EO-E148D — Authorization-Head Migration and Legacy-Writer Fencing Design

Status: DRAFT — DESIGN ONLY — NON-AUTHORIZING  
Baseline: protected `main` at `6c44dafe03b6e95f9e893b6c8e951871c00e0a5b`  
Supersedes: nothing; supplements `p0-a2b3-authoritative-staff-writer-enforcement.md`.

## 1. Scope and immutable safety boundaries

This step selects **no production topology** and makes **no migration**. It records a candidate protocol and evidence required before any implementation or rollout decision. All production execution, retry, recovery, coordinated writing, and OAuth activation gates remain disabled. The current `HOPE_STAFF_WRITER_TRANSITION_MODE` defaults to legacy compatibility; this application-level hold is neither proof of durable fencing nor authorization to turn on coordinated execution. Do not change its default as part of this step.

Do not deploy, change Azure resources or permissions, inspect live Staff records, start the private acceptance VM, send Microsoft Graph invitations, contact visitors, or edit existing StaffEvents. Preserve historical Staff identity, actor, event, Ministry Area linkage, and audit semantics. Existing production and original staging are outside this design step.

## 2. Observed baseline versus proposed authority

Current canonical StaffEvents uses partition `staffId`, event row `occurredAt__eventId`, and `createEntity`. The current per-Staff `__staff_security__head` reader strictly validates partition, row, numeric revision, matching `authorizationRevision`, state, and ETag; the Staff-scoped synthetic proofs do **not** establish a global Entra-binding authority or production fencing.

The proposed independent authoritative security boundary must serialize the decisions that can conflict across different Staff IDs, including normalized Entra tenant/object binding ownership. A **shared authority partition** is a candidate only; compare alternatives against Azure Tables transactional limits, contention, blast radius, recovery, and independently enforceable storage isolation before selection. Per-Staff security heads may remain evidence or projections, but they cannot alone prove global binding uniqueness.

Authority records should conceptually capture an ordering generation and revision, binding owner, Staff security state, operation/event identity, revocation state, and durable projection obligation. Final table and partition keys, entity shapes, retention, and scaling are deliberately undecided.

## 3. Required commit-time decisions

A future authorized mutation must demonstrate all of the following in its actual commit boundary:

1. A valid, active, eligible Staff authority state and expected non-revoked generation, not merely a fresh ETag.
2. An ETag-conditional authority revision transition, with monotonic generation/revision semantics and deterministic conflict classification.
3. Create-only replay-safe operation/event identities; a duplicate must never duplicate authoritative effects or silently accept conflicting payloads.
4. Entra binding ownership uniqueness across Staff IDs, including acquisition, reservation, replacement, release, and transfer; a pre-read or eventual canonical directory scan is insufficient.
5. A durable ordered event/projection obligation tied to the committed authoritative operation.
6. Rejection on absent, stale, malformed, contradictory, unverified, or uncertain evidence without inferred access.

A lost acknowledgement must be reconciled against durable evidence before any separately approved retry. Cross-partition or cross-table operations are **not** presumed atomic.

## 4. Legacy-writer fencing threat boundary

**Threat:** Independently deployed old code, direct Table clients, or broadly scoped storage credentials can append StaffEvents without consulting an application flag.

**Required invariant:** Neither a direct legacy StaffEvents append nor a legacy directory projection can grant binding ownership, staff activation, OAuth execution, or restoration after revocation.

Before implementation, create a metadata-only inventory of *all* Staff identity creation/update/deactivation, invitation creation/activation, API/service/direct repository paths, background jobs, and authorization-sensitive readers. Inventory deployment principals, managed identities, shared-key/connection-string/SAS capability **without obtaining or recording secret values**. Do not assume current code is the only writer.

Candidate enforcement combines:
- Authority storage permissions and credential separation so an independently deployed legacy writer cannot alter authority records.
- Authorization readers that consult independently enforced authority, fail closed on mismatch, and never treat canonical StaffEvents as an authoritative grant.
- A migration hold at relevant application entrypoints, including **before** irreversible Graph invitation effects; a hold alone is not a production fence.
- Event provenance and reconciliation to distinguish committed-authority projections, historical legacy events, and unauthorized/unverifiable appends.

If broadly privileged credentials can change the authoritative store, the fence remains **unproven** irrespective of synthetic passing tests. Read-only design review cannot assert production credential isolation.

## 5. Compatibility, migration, and rollback

- No deletion, rewriting, or silent reinterpretation of historical StaffEvents.
- Preserve stable Staff IDs, event ordering/payloads, actor attribution, directory and audit reads, Ministry Area relationships, and six-week staff ownership.
- Treat canonical StaffEvents as a compatibility/audit projection until a separately reviewed reader transition; projection is not a security authority.
- Track projection obligations durably; detect missing, duplicate, conflicting, out-of-order, or untrusted projections. Reconcile evidence before repair; no blind replay.
- Migration must classify historical identities and bindings without assuming that observed active StaffEvents or first-match binding lookup confers current security authority.
- Unknown or partially migrated state must deny new OAuth claims/external effects and automated retries.
- Rollback may restore compatibility reads or disable new paths, **never** undo a revocation, lower a security generation, or restore an obsolete binding owner or grant.

## 6. Invitation, session, and external-executor ordering

Microsoft Graph is outside a Table transaction. The future invitation path requires durable intent and ownership reservation, explicit state transitions, provider correlation evidence, and fail-closed handling for external success with unknown local commit. No duplicate Graph call from an uncertain acknowledgement.

Session/credential claims and revocation must order against the same authority with generation-aware predicates. A fresh ETag on a revoked head cannot grant a claim. An external executor requires its own immediately preceding revocation/cancellation fence and a documented uncertain-effect policy; storage commit alone is not execution permission.

## 7. Synthetic evidence required before writer changes

Use a **separately scoped** future implementation PR, isolated fixtures, and targeted tests to prove:
- Same binding concurrently claimed by different Staff IDs: at most one authoritative owner.
- Stale and fresh-ETag claims fail after revocation; race between deactivation and claim preserves revocation.
- Conditional conflict, duplicate operation identity, lost acknowledgement, malformed head, and partial projection failure fail closed with stable reconciliation.
- Direct legacy append never grants authorization; simulated old writer cannot mutate authority; every security-sensitive reader ignores unauthoritative projection.
- Historical directory/audit parity and Ministry Area/ownership semantics survive projection and rollback.
- Invitation external-success/local-failure and uncertain outcome cannot duplicate external effects.
- Storage permissions prevent an independently deployed legacy identity from rewriting authority; unit tests alone do not prove this deployment fact.

Evidence required before any production rollout must include independent review, objective CI/SDK-backed results, verified writer/reader and credential inventory, recovery runbook, and separately authorized controlled acceptance. No step automatically authorizes the next.

## 8. Proposed next work and explicit decision gates

**Gate E148D (this PR):** documentation-only, no implementation, review candidate authority and complete threat inventory plan.

**Gate E149 (future separate PR):** choose storage partition and executable protocol only after assessing uniqueness, contention, permission isolation, and failure semantics; introduce disabled, non-authorizing adapter plus synthetic tests.

**Later gates:** integrate coordinated writers and authorization readers only with proven non-bypass; reconcile canonical compatibility; prove independent external executor fences; review isolated pilot acceptance and rollout. Every phase requires accountable-owner approval and branch-protection review as applicable.

No readiness flag, historical passing proof, or documentation approval is a production migration permit.

## 9. Roadmap fence

Finish secure HOPE Ministry OS pilot readiness **before** HOPE Movement Pathway, seven-stage HOPE Growth Pathway, HOPE Next, or other future capabilities.
