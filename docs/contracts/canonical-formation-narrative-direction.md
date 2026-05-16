# Canonical Formation Narrative Direction

## Purpose

This document defines the future boundary for consolidating formation narrative assembly into a shared backend-owned reader.

The goal is not immediate refactor. The goal is to document the boundary before changing runtime behavior.

## Current Finding

Formation narrative assembly is currently duplicated across visitor narrative surfaces.

Current repeated formation narrative fields include:
- formation profile
- milestone summary
- followup lifecycle state
- attention state
- projection metadata

Current duplicated assembly points include:
- Azure Function visitor summary
- Express visitor summary adapter

## Existing Shared Building Blocks

Current shared backend components already exist:

- `getFormationProfile`
- `getFormationProfileByVisitorId`
- `projectFollowupState`
- formation profile projection/replay logic

These should be candidate inputs to a future canonical formation narrative reader.

## Architectural Risk

Duplicated formation assembly can cause:
- transport-specific formation narratives
- inconsistent milestone semantics
- inconsistent followup state attachment
- inconsistent attention state attachment
- inconsistent projection metadata exposure
- dashboard conditional behavior
- future pastoral intelligence input drift

## Milestone Derivation Risk

Milestone booleans are currently derived from `formationProfile.lastEventType`.

Current duplicated milestone fields:
- `hasSalvation`
- `hasBaptism`
- `hasMembership`

Milestone semantics must remain backend-owned.

Frontend must not:
- infer milestones from labels
- infer milestones from timeline text
- recompute milestone state from display values
- advance formation progression independently

## Target Direction

Introduce a backend-owned canonical formation narrative reader.

Possible future shape:

    readCanonicalFormationNarrative(visitorId)

This reader should return:
- profile
- milestones
- followup projection semantics
- projection metadata
- future state verification metadata

## Reader Responsibilities

The canonical formation narrative reader should:
- centralize formation profile retrieval
- centralize milestone derivation
- centralize followup projection attachment
- centralize projection metadata exposure
- preserve replay and reconciliation semantics
- provide stable inputs to the future visitor narrative builder

## Transport Boundary Rule

Transport surfaces must not independently assemble formation narrative semantics.

Allowed transport responsibilities:
- authentication
- validation
- request parsing
- response envelope shaping
- error handling

Forbidden transport responsibilities:
- milestone derivation
- followup state derivation
- attention state derivation
- projection metadata inference
- formation stage reinterpretation
- pastoral intelligence classification

## Migration Strategy

Migration should be incremental.

Recommended order:
1. keep existing visitor summary surfaces stable
2. document current duplication
3. add a small shared formation narrative reader
4. migrate Express visitor summary to the reader
5. migrate Azure Function visitor summary to the reader
6. use the reader as an input to the future canonical visitor narrative builder

## Non-Goals

This direction does not authorize:
- frontend formation lifecycle logic
- dashboard-owned milestone derivation
- changing public response shapes without contract review
- replacing existing formation endpoints
- large narrative-builder refactors before small reader extraction

## Long-Term Outcome

The canonical formation narrative reader should become one input into:
- visitor summary
- visitor detail
- formation and milestones views
- pastoral cockpit
- followup intelligence
- future pastoral AI assistance

The backend remains the source of truth.

