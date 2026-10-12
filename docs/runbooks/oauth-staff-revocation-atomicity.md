# Staff Revocation and OAuth Atomicity Requirements

## Status

Design and synthetic regression only.

This is not a production revocation handler, transaction,
fencing implementation, execution grant or migration plan.

The existing OAuth execution-fence readiness must remain
storageProtocolReady=false and executionPermitted=false.

## Current authoritative writes

Staff identity commands append events via
StaffEventsRepository to the StaffEvents Azure Table.

A staff deactivation produces staff.deactivated.
An Entra binding update produces staff.updated.

Staff invitation creation and activation also append
staff events. Their authorization implications require
explicit review before any participation rollout.

OAuth V2 ordering receipts use ETag-conditional
replacement of a separate storage entity.

Two independent successful writes do not prove atomicity.
A timeout or missing acknowledgement does not prove
that a write failed.

## Required linearization point

The eventual implementation must identify one trusted,
durable, commit-time ordering decision for all applicable
identity revocations and dependent OAuth operations.

Every participating writer must either use that same
ordering authority or be prevented from bypassing it.

Pre-read staff status, cached session state, application
locks and independent successful writes are insufficient.

The current StaffEvents and OAuth receipt entities do
not establish this boundary.

## Required ordering scenarios

### Revocation before claim

Once revocation commits, a subsequent claim at an older
revision must fail. Stale authorization evidence must
never be treated as permission for external execution.

### Claim before revocation

When a claim already exists, revocation must not silently
discard it. Pending revocation must block new claims.
The external executor requires separately proven
cancellation and fence enforcement.

### Competing revocations

Two writers using the same expected revision cannot
both advance the same ordering snapshot. A stale writer
must resolve conflict without automatic re-execution.

### Ambiguous acknowledgement

An uncertain storage result is neither a confirmed
commit nor a confirmed failure. It must prevent external
execution and automatic retries.

Reconciliation must use trusted durable attempt evidence.

### Independent staff and OAuth writes

All combinations of committed, not_committed and uncertain
must remain non-authorizing. Even two committed writes
cannot establish one atomic ordering boundary.

## Staff command integration requirements

Before live integration, identify and test all paths
that change staff status, Entra binding or session
eligibility, including invitation activation.

Preserve administrator authorization, canonical staff
identity, binding uniqueness and existing audit semantics.

Do not permit a fail-open fallback when coordination is
unavailable. Determine the required transaction boundary
before attempting any migration of live staff writers.

## External execution requirements

A storage receipt, successful claim or positive
precondition inspection is not an execution capability.

Independent external cancellation/fencing enforcement,
commit-time identity predicates, and recovery of
ambiguous outcomes must be demonstrated before any
execution feature is considered for enablement.

## Validation limitation

The accompanying tests inspect pure synthetic models.
They do not prove Azure cross-entity atomicity, real
concurrent execution, staff writer participation or
external executor cancellation.

## Prohibited by this PR

- Live staff deactivation or Entra binding mutation
- Changes to StaffEventsRepository
- Changes to OAuth storage repositories
- OAuth credential or session execution
- Azure configuration or storage provisioning
- Retry activation
- Feature flag changes
- Modification of real ministry records
