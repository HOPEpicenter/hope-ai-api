# Canonical Engagement Narrative Direction

## Purpose

This document defines the future boundary for consolidating engagement narrative assembly into a shared backend-owned reader.

The goal is not immediate refactor. The goal is to document the boundary before changing runtime behavior.

## Current Finding

Engagement narrative assembly is currently duplicated across visitor narrative surfaces.

Current repeated engagement narrative fields include:
- engagement summary
- engagement status
- last changed timestamp
- last status event ID
- engagement risk
- timeline preview

Current assembly points include:
- Azure Function visitor summary
- Express visitor summary adapter
- dashboard card surfaces
- OPS inspection surfaces
- future pastoral cockpit surfaces

## Existing Shared Building Blocks

Current shared backend components already exist:

- `EngagementSummaryRepository`
- `EngagementsService.getCurrentStatus`
- `readEngagementRiskV1`
- `IntegrationService.readIntegratedTimeline`

These should be candidate inputs to a future canonical engagement narrative reader.

## Architectural Risk

Duplicated engagement assembly can cause:
- transport-specific engagement narratives
- inconsistent timeline preview behavior
- inconsistent engagement risk windows
- inconsistent status metadata exposure
- dashboard conditional behavior
- future pastoral intelligence input drift

## Timeline Preview Risk

Timeline previews are especially sensitive because they influence:
- visitor detail context
- pastoral cockpit context
- journey derivation
- dashboard summary cards
- future AI reasoning windows

Preview semantics must remain backend-owned.

Frontend must not:
- reorder preview items
- deduplicate preview items
- merge preview streams independently
- infer engagement state from preview alone

## Target Direction

Introduce a backend-owned canonical engagement narrative reader.

Possible future shape:

    readCanonicalEngagementNarrative(visitorId)

This reader should return:
- summary
- status
- lastChangedAt
- lastEventId
- risk
- timelinePreview

## Reader Responsibilities

The canonical engagement narrative reader should:
- centralize engagement summary retrieval
- centralize status retrieval
- centralize engagement risk retrieval
- centralize timeline preview retrieval
- preserve canonical timeline ordering
- preserve risk window semantics
- provide stable inputs to the future visitor narrative builder

## Transport Boundary Rule

Transport surfaces must not independently assemble engagement narrative semantics.

Allowed transport responsibilities:
- authentication
- validation
- request parsing
- response envelope shaping
- error handling

Forbidden transport responsibilities:
- risk-window selection without contract review
- timeline preview reinterpretation
- engagement status reinterpretation
- dashboard-only engagement state
- pastoral intelligence classification

## Migration Strategy

Migration should be incremental.

Recommended order:
1. keep existing visitor summary surfaces stable
2. document current duplication
3. add parity tests around visitor summary engagement payloads
4. introduce a small shared engagement narrative reader
5. migrate Express visitor summary to the reader
6. migrate Azure Function visitor summary to the reader
7. use the reader as an input to the future canonical visitor narrative builder

## Non-Goals

This direction does not authorize:
- frontend engagement lifecycle logic
- dashboard-owned engagement risk calculations
- changing public response shapes without contract review
- replacing existing engagement endpoints
- large narrative-builder refactors before small reader extraction

## Long-Term Outcome

The canonical engagement narrative reader should become one input into:
- visitor summary
- visitor detail
- dashboard cards
- pastoral cockpit
- followup intelligence
- future pastoral AI assistance

The backend remains the source of truth.

