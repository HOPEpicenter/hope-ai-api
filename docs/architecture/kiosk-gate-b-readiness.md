# HOPE Kiosk Staff Authority - Gate B Readiness

Status: PROPOSED / NON-AUTHORIZING
Initial checkpoint: 2026-11-17
Owner: HOPE Ministry OS
Base commit: 1be2cecd9b19b7387de86ca5ab20fddf9ae8487a

## 1. Purpose

Prepare a narrowly scoped, temporary isolated kiosk
Staff Authority acceptance environment.

The kiosk will eventually become part of HOPE Ministry OS.
This is not permission to create a parallel permanent
Staff administration system.

No Azure provisioning, deployment, RBAC assignment,
job execution, Staff creation, or authority activation
is approved by this document.

## 2. Verified integrated baseline

Backend foundation PR #1507 is merged.
Original-staging safety PR #1508 is merged.
Protected-main CI succeeded at the integrated checkpoint.

Original staging deployment requires explicit dispatch.
No automatic staging deployment is intended on merges.

The kiosk Staff Authority remains disabled.

## 3. Proposed authority infrastructure

Separate authority resource group:
rg-hope-kiosk-staff-authority

Authority storage:
sthopekauth20261122

Authority Table:
StaffAuthority

Dedicated writer identity:
id-hope-kiosk-authority-writer

Workload-profiles Container Apps environment:
cae-hope-kiosk-authority

Manual-only bootstrap job:
job-hope-kiosk-authority-bootstrap

Dedicated delegated subnet:
snet-kiosk-staff-authority
10.88.0.160/27

Authority Table private endpoint:
pe-kiosk-authority-table

Log Analytics workspace:
law-hope-kiosk-authority

Dedicated Premium Container Registry candidate:
hopekioskauth2026

Private registry DNS zone required:
privatelink.azurecr.io

Registry private endpoint and DNS integration
require a separate, approved provisioning manifest.

Existing Basic registry hopekioskff2026 remains unchanged.

All proposed names remain unreserved.

## 4. Financial planning

Existing HOPE Ministry OS budget:
HOPE-Ministry-OS-Annual-1500

Annual amount:
USD 1500

Verified forecast notification levels:
50 percent, 80 percent, 90 percent.

Current reported spend at K379L:
USD 45.4921332499269

Reported forecast at K379L:
USD 191.2779039011

Forecast coverage period requires confirmation.

Temporary kiosk planning ceiling:
USD 100 per month.

Illustrative 30-day infrastructure allocation:
USD 75.60.

This is not a firm quotation or enforced spending cap.
Actual costs, 31-day charges, image storage, data transfer,
logging, alerts and usage variability must be assessed.

Do not change the existing annual budget without approval.
Do not assume existing budget notifications enforce a cap.

## 5. Authority security boundaries

Staff Authority remains default-disabled.

The dedicated authority writer must not inherit
operational kiosk backend identity privileges.

Exact effective RBAC must be independently verified.

The built-in Storage Table Data Contributor role
includes entity and table deletion capabilities.
It is not the final production permission selection.

Evaluate a dedicated least-privilege custom role
using exact Azure operations and synthetic acceptance.

Removing delete permission does not prevent
tampering through update or write permissions.

Historical receipts require independently protected
evidence and verifiable recovery semantics.

Conditional ETags protect concurrency but do not
make records immutable.

No standing job-start permission.
No scheduling.
No automatic retries.
No unrestricted job template overrides.
No Graph invitations.
No automated visitor contact.

## 6. Required acceptance proofs

Before live activation, prove:
- Private registry image pull and DNS connectivity.
- Private authority Table connectivity.
- Exact writer identity and Table permission scope.
- Effective inherited administrator permissions.
- Required conditional authority operations.
- Rejection of disallowed mutations.
- Durable and independently protected receipts.
- Generation/revocation replay safety.
- Fail-closed recovery and projection reconciliation.
- Monitoring, alerting and evidence retention.
- Controlled manual execution authorization.
- No access to original staging or production.

Synthetic Azure acceptance requires separate
owner authorization and infrastructure readiness.

## 7. Temporary-to-integrated lifecycle

Document before activation:
- Criteria for integrating the kiosk into Ministry OS.
- Canonical Staff identity and authority ownership.
- Data reconciliation and provenance requirements.
- Privilege revocation before migration.
- Safe handoff and rollback conditions.
- Retention and deletion approval requirements.
- Retirement of temporary billed resources.

No automatic authority migration is permitted.

## 8. Approval separation

Gate B design review is not provisioning permission.

Provisioning requires explicit owner approval
of the exact resource, identity, cost and network manifest.

Any manual authority job execution requires
a further explicit authorization.

First-administrator creation and live Staff Authority
activation require separate acceptance and approval.

## 9. Authority writer permission contract

Status: CANDIDATE DESIGN / NOT AUTHORIZED.

### 9.1 Identity and scope

Dedicated writer:
id-hope-kiosk-authority-writer

Storage:
sthopekauth20261122

Table:
StaffAuthority

Proposed RBAC assignment scope:
Individual StaffAuthority Table only.

The exact Azure resource ID must be verified
before any separately authorized assignment.

No storage-account-wide, resource-group-wide,
or subscription-wide writer assignment.

### 9.2 Candidate permissions

Control-plane:
- Microsoft.Storage/storageAccounts/tableServices/tables/read

Data-plane:
- Microsoft.Storage/storageAccounts/tableServices/tables/entities/read
- Microsoft.Storage/storageAccounts/tableServices/tables/entities/add/action
- Microsoft.Storage/storageAccounts/tableServices/tables/entities/update/action

Excluded by default:
- Entity deletion
- General entity write
- Table creation and deletion
- Storage account management
- RBAC management
- Container Apps Job start and modification
- Unrelated storage access

These permissions are candidates only.

Validate required Azure SDK requests, conditional
ETags, batch transactions, and role compatibility
before selecting a deployable custom role.

### 9.3 Receipt integrity

The authority writer must not be able to
modify or delete independently protected
historical authority evidence.

A separate security principal and evidence
retention mechanism are required.

Removing delete permission alone is insufficient.
Entity updates may still modify historical records.

ETags provide concurrency protection, not
immutable evidence or writer-compromise protection.

Missing, conflicting, or unverifiable evidence
must result in default-deny authorization.

### 9.4 Synthetic acceptance

Before live activation, verify:
- Exact Table-scoped identity assignment
- Allowed conditional authority operations
- Denied entity deletion
- Denied Table management
- Denied unrelated storage access
- Denied protected-receipt modification
- Revocation and replay protection
- Fail-closed recovery after writer compromise
- Independent monitoring and evidence retention

Tests require separately authorized infrastructure
and synthetic execution.

### 9.5 Authorization boundary

No custom role creation.
No RBAC changes.
No Azure provisioning.
No deployment.
No authority job execution.
No Staff creation.
No Staff Authority activation.

## 10. Independent authority receipt protection

Status: CANDIDATE / NOT AUTHORIZED.

### 10.1 Storage isolation

Use independently protected Azure Blob evidence
for historical authority receipts.

Candidate: private Blob container with locked
time-based WORM retention.

The storage account, container, identity, private
networking, retention duration and cost require
separate design and approval.

Do not enable or lock retention during planning.

### 10.2 Identity separation

Authority writer:
- May perform narrowly approved Table operations.
- Must not have receipt Blob write/delete access.
- Must not manage receipt retention policies.
- Must not modify receipt identity permissions.

Receipt writer:
- Uses a separate managed identity.
- Receives minimum required create permissions.
- Must not administer StaffAuthority Table.
- Must not shorten or remove retention policies.

Receipt verification must be independent of the
authority writer's untrusted claims.

Effective inherited Azure privileges require review.

### 10.3 Receipt envelope

Each receipt must identify:
- Operation ID and idempotency key.
- Authority generation and expected predecessor.
- Operation type and outcome.
- Canonical event digest.
- Prior receipt digest or trusted checkpoint.
- Persisted Blob identity and content digest.
- Trusted timestamps and verification result.

Do not store secrets or unnecessary Staff PII
inside receipts.

Exact canonical serialization and signature
or trusted attestation method remain open.

### 10.4 Commit and recovery protocol

Azure Table and Blob operations are not assumed
to share an atomic transaction.

Before authorization can be accepted:
- Verify the independently protected receipt.
- Verify state, generation and predecessor.
- Reject mismatches, gaps and duplicate conflicts.
- Reject missing or unverifiable receipts.
- Preserve an explicit recovery-required state.

On a partial write:
- Do not silently mark the operation successful.
- Block subsequent conflicting operations.
- Reconcile from independently protected evidence.
- Require controlled recovery authorization.

The ordering and recovery algorithm must be
specified and tested before implementation.

### 10.5 Retention and lifecycle

Locked WORM retention is difficult to reverse
and can outlast the temporary kiosk deployment.

Choose retention only after reviewing:
- Ministry record retention requirements.
- Privacy and data minimization.
- Account and container deletion implications.
- Storage charges and continuing costs.
- Migration into canonical HOPE Ministry OS.
- Owner-approved retirement procedures.

Do not treat Blob immutability alone as proof
against all subscription administrators.

### 10.6 Synthetic acceptance gates

Prove:
- Receipt writer identity isolation.
- Receipt creation with approved permissions.
- Denied overwrite and deletion under retention.
- Denied retention-policy changes by the writer.
- Denied protected-evidence access by authority.
- Missing receipt fails closed.
- Altered receipt fails closed.
- Table succeeded / Blob failed recovery.
- Blob succeeded / Table failed recovery.
- Duplicate, reordered and replayed events fail.
- Recovery remains correct across restarts.
- Effective privileged-role review is recorded.

Use only synthetic records after explicit owner
authorization for infrastructure and execution.

### 10.7 Explicit non-authorization

No Blob account or container creation.
No WORM policy creation or locking.
No managed identity creation.
No RBAC changes.
No Azure deployment or job execution.
No Staff creation or activation.

## 11. Fail-closed reconciliation state machine

Status: DESIGN CONTRACT / NOT IMPLEMENTED.

### 11.1 Readiness states

UNVERIFIED:
- Authority evidence has not been reconciled.
- All authority-dependent actions are denied.

VERIFIED:
- Canonical state and independently protected
  receipt chain agree at the trusted generation.
- Required authorization checks still apply.

RECOVERY_REQUIRED:
- A partial or interrupted operation is detected.
- Authority-dependent actions are denied.
- Conflicting state transitions are prohibited.

SECURITY_CONFLICT:
- Evidence is missing, invalid, reordered,
  contradictory or inconsistent with state.
- Authority-dependent actions are denied.
- Independent investigation is required.

### 11.2 Required operation protocol

The final protocol must specify:
- An authorized operation request and identity.
- A durable idempotency reservation.
- Expected authority generation and predecessor.
- Independently protected operation intent.
- Conditional Table state transition.
- Independently protected completion evidence.
- Verification of both state and receipt chain.
- A durable final outcome or recovery marker.

Neither the intent receipt nor Table success alone
is evidence that the operation completed safely.

The exact atomicity boundary and ordering remain
open implementation decisions.

### 11.3 Required reconciliation outcomes

Intent exists, Table not changed:
- RECOVERY_REQUIRED until resolved.

Table changed, completion receipt missing:
- RECOVERY_REQUIRED.
- Do not issue new authority.

Completion receipt exists, Table mismatch:
- SECURITY_CONFLICT unless an independently
  validated recovery protocol proves otherwise.

Duplicate operation, identical evidence:
- Return an already verified outcome only after
  checking the durable canonical result.

Duplicate operation, conflicting evidence:
- SECURITY_CONFLICT.

Generation gap or predecessor mismatch:
- SECURITY_CONFLICT.

Unavailable protected evidence:
- UNVERIFIED or RECOVERY_REQUIRED.
- Never infer authority from cached Table state.

### 11.4 Operational isolation

The authority writer cannot declare its own
evidence verified.

A separate verifier must evaluate protected
receipts and canonical state.

Verifier trust, keys, access and compromise
boundaries require independent review.

Do not grant ordinary kiosk runtime identities
unrestricted repair or approval permissions.

Privileged recovery requires explicit owner
authorization and retained audit evidence.

### 11.5 Synthetic regression requirements

Test all four readiness states.

Test failures at each durable write boundary.

Test restart after partial persistence.

Test exact retry and conflicting retry.

Test duplicate, reordered and missing receipts.

Test writer compromise and verifier rejection.

Test revocation surviving replay and restart.

Test recovery denial without independent approval.

Test that no incomplete operation grants
authority-dependent permissions.

### 11.6 Release gate

This contract does not activate Staff Authority.

Do not authorize live execution until the
protocol has an independently reviewed
implementation, passing synthetic regressions
and separately approved private Azure acceptance.

No deployment, provisioning, Staff creation,
RBAC change or authority activation is permitted.
