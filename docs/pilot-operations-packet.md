# Pilot Operations Packet

Purpose: provide a lightweight operating guide for a controlled HOPE pilot.

## Pilot status

Backend is ready for a controlled pilot. No additional major backend architecture work is required before pilot. Keep the pilot controlled, operator-led, and backend-truth-driven.

## Start-of-day checklist

1. Confirm staging deploy is healthy.
2. Confirm API health endpoint responds.
3. Confirm ops health endpoint responds.
4. Confirm operators know the pilot workflow for the day.
5. Confirm known incidents or limitations are visible to operators.

## Health checks

PowerShell commands:

Invoke-RestMethod "https://hope-ai-api-staging.azurewebsites.net/api/health"
Invoke-RestMethod "https://hope-ai-api-staging.azurewebsites.net/ops/health"

Expected result: ok is true.

## Operator workflow

1. Start from the agreed operator surface.
2. Review ready care or follow-up work.
3. Open the visitor record.
4. Record contact, follow-up, or outcome activity.
5. Confirm the queue/card/timeline state updates as expected.
6. Do not infer state from frontend display alone when backend read models exist.

## Incident logging

Record each incident with:

- date/time
- operator
- visitorId if applicable
- action attempted
- expected behavior
- actual behavior
- screenshot/log link if available
- severity: low, medium, high
- whether pilot work can continue

## Stop-of-day checklist

1. Confirm no active operator workflow is mid-action.
2. Record unresolved incidents.
3. Record confusing workflow moments.
4. Confirm staging health still passes.
5. Decide whether any issue is a blocker or normal follow-up.

## Escalation rules

Pause pilot work if:

- health endpoints fail
- deploy pipeline fails and blocks recovery
- visitor state appears corrupted
- follow-up queue state diverges from visitor/timeline state
- operators cannot safely determine next action

Do not pause pilot for cosmetic dashboard issues unless they block safe operator action.

## Scope guardrails

- Do not add backend features during pilot unless a real blocker appears.
- Do not widen orchestration, dashboard, RBAC, team workflow, or export format scope during pilot.
- Keep fixes small, PR-based, and validated through CI and staging deploy.