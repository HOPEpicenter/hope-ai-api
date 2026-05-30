# Pilot Known Limitations

## Purpose

This document lists known limitations for the controlled HOPE pilot.

## Ops Preview Latency

Staging ops-preview latency has been observed around 17 to 18 seconds.

Local latency is approximately 0.6 seconds.

Likely causes:

- Azure Function cold start
- Storage access latency
- Production-sized data

### Pilot Guidance

- Treat slow responses as expected unless they fail.
- Avoid repeated clicks during slow responses.
- Record unusually slow or failed interactions.

## API Key Protection

The pilot currently uses coarse API-key protection.

### Pilot Guidance

- Limit API key distribution.
- Do not treat API-key protection as full per-user authorization.
- Continue using operator attribution for workflow accountability.

## Operator Registry

Operator identities are currently code/config driven.

### Pilot Guidance

- Add or update operators through PR workflow.
- Do not invent new operator IDs.
- Use known registry operators only.

## No Realtime Sync

The dashboard does not currently provide realtime collaborative sync.

### Pilot Guidance

- Refresh or revisit the queue if another operator may have acted.
- Avoid two operators working the same card simultaneously.

## Dashboard Is Pilot MVP

The Today cockpit is the primary pilot operator surface but is not the final UX.

### Pilot Guidance

- Focus on workflow correctness.
- Report confusing UX.
- Do not treat visual polish as a pilot blocker unless it prevents safe operation.

## Full Auth/RBAC Deferred

Full per-user auth, JWT identity, and RBAC are deferred.

### Pilot Guidance

- Keep the pilot controlled.
- Limit operator access.
- Rely on current route protection and operator attribution.
- Revisit full auth before broader rollout.
