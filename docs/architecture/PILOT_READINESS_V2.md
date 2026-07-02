# HOPE Pilot Readiness v2

**Status:** Living engineering operating system  
**Generated from:** merged API PR history and Dashboard Next PR history  
**Purpose:** Keep every engineering recommendation grounded in evidence before the pilot.

## Mission

Build the first production-ready Ministry Operating System that helps pastors answer:

- Who needs me today?
- Why do they need me?
- What is the next faithful step?
- What is this person's complete ministry story?

## Readiness Snapshot

| Area | Status | Readiness | Evidence |
|---|---|---:|---|
| Backend platform | Green | 96% | API PRs cover route parity, canonical projections, contract coverage, staging certification, care, activity intelligence, and governance. |
| Dashboard Next | Green | 92% | Dashboard PRs #1-#62 establish shell, Today, Person 360, Journey, Care, Insights, Admin, resilience, and pastor-first language. |
| Canonical contracts | Green | 95% | Dashboard-card, activity intelligence, care, timeline, and opportunity contracts are covered and hardened. |
| Pastor workflow | Yellow | 86% | Core workspaces exist; remaining work is workflow continuity/audit, not foundational architecture. |
| Documentation | Yellow | 70% | Documentation exists but needs reconciliation against the merged PR ledger. |
| Pilot operations | Green/Yellow | 88% | Pilot operations packet, route inventory, staging certification, and known limitations are documented. |
| Accessibility/usability audit | Yellow | 75% | Needs deliberate final pilot pass across all workspaces. |

## Current System Map

```text
Visitor Identity
    -> Formation Events
    -> Formation Profile
    -> Canonical Readers
    -> Care / Journey / Opportunity / Timeline / Dashboard Card
    -> Azure Functions + Express Parity
    -> Dashboard Next Server Loaders
    -> Pastor Workspaces
```

## What is Done

### Backend

- Global timeline and integration foundations.
- Formation event and profile projection hardening.
- Care candidate projections, queue, summary, export, assignment, and integrity contracts.
- Followup terminal/non-terminal outcome semantics.
- Activity intelligence and opportunity worklists.
- Opportunity narratives, action reasons, and resolution metadata.
- Visitor notes, phone, address, birthday, and identity update contracts.
- Dashboard-card enrichment for next steps, outcomes, prayer, assignments, and stage metadata.
- Express/Azure Functions route parity and contract coverage.
- Pilot readiness review, route inventory, staging certification, and operations packet.

### Dashboard Next

- App shell and server-side backend API helper.
- Today Command Center.
- Person 360 / People directory and profile.
- Journey story workspace.
- Care workspace with ownership and outcome actions.
- Insights / Opportunity Intelligence workspace.
- Persistent visitor snapshot rail.
- Global visitor context.
- PersonMinistryHeader and selected person identity fallback.
- Nonfatal backend loading and DataHealthBanner.
- Backend smoke helper.
- Pastor-first language across Today, People, Journey, Care, Insights, and Admin.
- Ministry OS v2 blueprint.

## Remaining Pilot Work

| Priority | Item | Status | Notes |
|---:|---|---|---|
| 1 | Documentation reconciliation | Active | Update MASTER_PLAN, checklist, inventories, and flow chart from PR ledger. |
| 2 | Pastor workflow continuity audit | Ready | Verify Today -> Person 360 -> Journey -> Care -> Insights behaves as one ministry workflow. |
| 3 | Accessibility and empty-state audit | Ready | Keyboard, focus, labels, warnings, loading, and empty-state language. |
| 4 | Morning briefing decision | Investigate | Build only if no existing canonical read model already satisfies the need. |
| 5 | Pilot validation run | Ready after audits | Validate deployed dashboard + staging/production API with pastor workflow scenarios. |

## Recommendation Gate

Before any implementation recommendation:

1. Check the PR ledger.
2. Check canonical services/inventories.
3. Confirm it is not already merged.
4. Confirm it is pilot-relevant.
5. Confirm it is the highest-value unfinished milestone.

## Next PR Recommendation

**Docs PR:** `docs: add Hope Pilot Readiness v2 reconciliation`

Scope:

- Add this Pilot Readiness v2 package.
- Do not change runtime behavior.
- Do not create backend/dashboard features.
- Use this as the source for future MASTER_PLAN and checklist updates.
