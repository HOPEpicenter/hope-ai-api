# Care Workflow Model v1

## Purpose

Define how pastoral care work starts after followup outcomes, especially needs_care.

This document does not implement the task engine, dashboard rebuild, care plans, or migrations. It defines the product/domain contract for future backend work.

## Outcome Semantics

| Followup Outcome | Followup Resolved | Followup Active | Opens Care Workflow | Advances Formation Stage |
|---|---:|---:|---:|---:|
| connected | yes | no | no | yes |
| closed | yes | no | no | no |
| no_response | no | yes | no | no |
| left_message | no | yes | no | no |
| needs_care | no | yes | yes | no |

## Product Rules

needs_care means the visitor still needs pastoral attention after contact or attempted contact.

It should not be treated as resolved.

It should not advance Formation stage to Connected.

It should remain visible in active followup surfaces until a future care workflow takes ownership.

## Care Workflow v1 Concept

needs_care outcome recorded
-> care candidate opened
-> care assignment
-> care plan or pastoral action
-> care closed

## Proposed Future Fields

- careStatus
- careLevel
- careCategory
- careAssignedTo
- careOpenedAt
- careClosedAt
- careReason
- carePlanId

## Workflow Boundary

Followup workflow answers: Did someone attempt/contact/follow up with this visitor?

Care workflow answers: What ongoing pastoral care does this person need now?

## Non-Goals

This PR does not implement task engine, care queue, care plan API, dashboard rebuild, migration/backfill, reopen/undo behavior, or notification automation.
