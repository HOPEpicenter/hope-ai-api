# Phase C protected Azure Automation job-creation contract

Status: DESIGN ONLY — EXECUTION DISABLED

## Existing boundaries

- Recovery ledger owns durable coordination and creation reservations.
- Authorization gates deny live execution.
- Azure job observations are not trusted operation bindings.
- The existing E156 cleanup runbook has Execute and SelfTest
  parameters, but no published OperationId parameter.
- The existing E156 cleanup runbook must not be modified by
  the recovery controller.

## Required protected authority

A future trusted issuer must independently authenticate and authorize
the operation. The authorization must bind:

- Canonical operation identifier
- Exact permitted Azure resource scope
- Exact permitted operation-aware runbook
- Durable creation request identifier
- Expiration and one-time authorization semantics
- Immutable approval provenance

Caller-provided flags, local environment variables, unsigned
receipts, and recovery leases cannot grant execution authority.

## Durable job creation

- Persist the request ID before attempting cloud creation.
- Use the persisted request ID as the deterministic job name.
- Reject duplicate reservations.
- Treat network timeouts and unknown outcomes as unresolved.
- Never generate a replacement job ID during recovery.
- Never blindly retry an uncertain cloud creation request.
- Reconcile exact resource identity using authenticated ARM reads.
- Prevent other creation paths from bypassing durable coordination.

## Operation binding

An exact Azure job metadata match proves neither trusted
operation ownership nor approval.

A future operation-aware runbook must support a separately
verified operation binding and independently enforce its allowed
execution scope.

Only a protected creation authority may certify the relationship
between an authorized operation and a created Azure job.

## Completion and cleanup

Creating a job does not prove cleanup success.

Independent evidence is required for:
- VM lifecycle and deallocation
- Managed Run Command removal
- Temporary role assignment revocation
- Temporary network and resource cleanup
- Absence of remaining unsafe resources

Uncertain or incomplete evidence remains fail-closed.

## Prohibited until separately approved

- Azure Automation job creation
- Azure resource or permission mutations
- Live recovery execution
- Production or staging deployments
- Staff Authority activation
- Automated visitor contact

This contract is not an execution authorization.
