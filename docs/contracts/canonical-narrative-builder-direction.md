# Canonical Narrative Builder Direction

## Purpose

This document captures the architectural direction for consolidating HOPE visitor narrative assembly into one backend-owned derivation layer.

The goal is not immediate refactor. The goal is to define the future boundary before changing runtime behavior.

## Current Finding

Visitor narrative assembly is currently duplicated across transport surfaces.

Current assembly points include:
- Azure Function visitor summary
- Express visitor summary adapter
- visitor journey surfaces
- dashboard card surfaces
- followup projection consumers
- integration timeline preview consumers

## Architectural Risk

Duplicated narrative assembly can cause:
- transport-specific visitor narratives
- followup semantic drift
- attention state drift
- journey state drift
- dashboard conditional behavior
- inconsistent intelligence-layer inputs
- future pastoral AI instability

## Existing Shared Building Blocks

Current shared derivation blocks already exist:

- `deriveJourneySummaryV1`
- `projectFollowupState`
- `readEngagementRiskV1`
- `IntegrationService.readIntegrationSummary`
- `IntegrationService.readIntegratedTimeline`

These should be treated as candidate inputs to a future canonical narrative builder.

## Target Direction

Introduce a backend-owned canonical narrative assembly layer.

Possible future shape:

    buildCanonicalVisitorNarrative(input)

or:

    readCanonicalVisitorNarrative(visitorId)

This layer should become the single semantic authority for:
- visitor identity context
- engagement summary
- engagement status
- engagement risk
- timeline preview
- formation profile
- followup lifecycle state
- attention state
- integration summary
- journey state
- projection integrity
- state verification metadata

## Transport Boundary Rule

Transport surfaces must not independently derive narrative semantics.

Allowed transport responsibilities:
- authentication
- validation
- request parsing
- response envelope shaping
- error handling

Forbidden transport responsibilities:
- followup lifecycle derivation
- attention state derivation
- journey interpretation
- formation interpretation
- timeline reinterpretation
- projection integrity inference
- pastoral intelligence classification

## Canonical Builder Responsibilities

A future canonical narrative builder should:
- assemble one canonical visitor story
- use shared backend derivation utilities
- preserve replay and projection semantics
- preserve canonical timeline semantics
- expose explicit metadata for integrity and verification
- provide stable inputs for dashboard and intelligence surfaces

## Migration Strategy

Migration should be incremental.

Recommended order:
1. keep existing surfaces stable
2. document current drift risks
3. extract small shared helpers only where proven duplicated
4. add parity tests around summary outputs
5. migrate Express and Azure Function summaries to the shared builder
6. keep dashboard as a thin consumer

## Non-Goals

This direction does not authorize:
- dashboard-owned lifecycle logic
- frontend state inference
- premature large refactors
- changing public response shapes without contract review
- moving orchestration out of backend domain layers

## Long-Term Outcome

The canonical narrative builder should become the foundation for:
- visitor detail
- pastoral cockpit
- followup intelligence
- care continuity
- future pastoral AI assistance
- multi-surface dashboard trust

The backend remains the source of truth.

