# HOPE Kiosk Staff Authority - Gate A Security Review

Status: PROPOSED / DESIGN ONLY / NON-AUTHORIZING
Date: 2026-11-17
Repository: HOPEpicenter/hope-ai-api
Review PR: #1507

## 1. Purpose

Define the minimum-change infrastructure and security
architecture for a dedicated isolated kiosk Staff Authority.

The eventual goal is a separately approved, audited one-time
bootstrap of the existing Yahoo Entra Guest as the first
isolated kiosk administrator.

This document does not authorize provisioning, deployment,
Staff creation, Staff Authority activation, OAuth execution,
Graph invitations, or changes to original staging/production.

## 2. Verified isolated kiosk baseline

Subscription: Microsoft Azure Sponsorship
Resource group: rg-hope-kiosk-acceptance-20261122
Region: eastus2
Backend: hope-kiosk-acceptance-api
Backend identity: one user-assigned managed identity

Operational storage: sthopekiad20261122
Transfer storage: sthopekitransfer1122

Both accounts:
- StorageV2 / Standard_LRS
- Public network access Disabled
- Shared key access False
- Anonymous blob access False
- Default network action Deny
- Minimum TLS 1.2
- Provisioning Succeeded

Existing backend identity has these assignments on the
operational storage account:
- Storage Blob Data Owner
- Storage Queue Data Contributor
- Storage Table Data Contributor

These are observed assignments, not a complete proof of
effective privileges or alternate credential access.

## 3. Verified network

VNet: vnet-hope-kiosk-acceptance

Subnets:
- snet-kiosk-flex: 10.88.0.0/26
  Delegation: Microsoft.App/environments
- snet-kiosk-private-endpoints: 10.88.0.64/27
  Existing private endpoints: 5
- snet-kiosk-deployment-runner: 10.88.0.96/27
- snet-kiosk-frontend-integration: 10.88.0.128/27
  Delegation: Microsoft.Web/serverFarms

Existing private DNS:
- privatelink.blob.core.windows.net
- privatelink.queue.core.windows.net
- privatelink.table.core.windows.net
- privatelink.azurewebsites.net

Candidate: reuse existing private endpoint subnet and
Table private DNS infrastructure, only after validating
IP availability, routing, zone linkage and separation.

Do not change existing subnet delegations.

## 4. Proposed resources - NOT provisioned

Proposed authority storage:
  sthopekauth20261122

Proposed writer managed identity:
  id-hope-kiosk-authority-writer

Proposed authority table:
  StaffAuthority

Proposed Table private endpoint:
  pe-kiosk-authority-table

Proposed writer workload:
  a separate, disabled and controlled workload;
  exact hosting technology remains undecided.

All names require availability and convention checks.

Prefer a dedicated authority resource group if the
effective administrative permissions justify it.
No new resource group has been approved.

Cost, regional availability, topology and resource names
are subject to independent review.

## 5. Required authority storage configuration

- StorageV2 / proposed Standard_LRS / eastus2
- Public network access disabled
- Shared-key authorization disabled
- Anonymous blob access disabled
- TLS 1.2 minimum or stronger
- Private Table endpoint
- Microsoft Entra managed identity authentication
- Audit and diagnostics appropriate for authority writes
- No shared application connection strings or account keys

Do not assume a separate account alone proves isolation.

## 6. Identity and trust boundary

Existing kiosk backend:
- Retains existing operational access.
- Must not receive authority-store data write access.
- Cannot grant Staff administrator authority from
  untrusted canonical StaffEvents evidence.

Dedicated authority writer:
- Separate managed identity and workload.
- Minimum required authority Table data permissions.
- No broad canonical StaffEvents mutation capability
  unless separately justified and reviewed.
- Writer disabled until protocol and security approval.

Authorization reader:
- Reads independently trusted authority evidence.
- Must fail closed if evidence is absent or inconsistent.
- May not independently grant authority from historical
  StaffEvents projections.

Operators and CI:
- Audit inherited roles, role administrators,
  privileged deployment principals, group memberships,
  account keys and alternate credential pathways.
- Prefer narrower Table-level permission scopes
  where supported and verified.

## 7. Storage and consistency protocol

Proposed authoritative records:
- Normalized Entra tenant/object binding ownership
- Stable Staff identity reference
- Ordering head, revision and security generation
- Immutable operation receipts
- Revocation and cancellation state
- Durable canonical projection obligations

Shared-partition conditional Table transactions are a
leading candidate, not a finalized production schema.

Demonstrate commit-time uniqueness, concurrency handling,
replay rejection and generation fencing.

Authority commits and canonical StaffEvents projections
are distinct transactions; do not claim distributed
atomicity.

Canonical StaffEvents remains historical compatibility
evidence, not independent authorization authority.

## 8. Interrupted-operation recovery

Required behavior:
- Lost acknowledgement: inspect receipt before any retry.
- Reservation without canonical projection: reconcile.
- Conflicting ownership: stop, deny, and review.
- Missing storage evidence: fail closed.
- Stale generation: cannot reauthorize after revocation.
- Incomplete projection: must not grant administrator access.
- Repeated operation ID: deterministic, replay-safe result.

No automatic retry, reservation release, recovery write,
Graph action or OAuth execution is authorized.

## 9. Security acceptance gates

A. Architecture and cost review:
   Finalize exact resource names, group, subnet,
   hosting, schema, permission scope and rollback.

B. Separate infrastructure authorization:
   Specific approval for creation and RBAC changes.
   No Staff activation or live creation.

C. Independent isolation proof:
   Verify direct legacy-authority write is denied
   by Azure storage permissions, not merely application
   code or mocked ports.

D. Protocol acceptance:
   Prove concurrent binding ownership, ETags,
   atomicity, replay and ambiguous acknowledgement.

E. Integration acceptance:
   Validate authoritative readers, durable projection,
   compatibility, revocation and external executor fences.

F. Independent security sign-off:
   Review observed evidence and remaining risks.

G. Separate bootstrap authorization:
   Verify existing Yahoo Guest, no conflicting binding,
   audited one-time Staff creation and actual browser sign-in.

No gate automatically authorizes the next one.

## 10. Existing foundation

Draft PR #1507 includes disabled kiosk bootstrap
foundations, legacy Staff writer and invitation fences,
mandatory reservation readback, test-only creation
integration, read-only reconciliation, and an Azure
runtime fence on the atomic-creation prototype.

All remain non-authorizing. A green CI build does not
grant storage isolation, writer exclusivity or permission
for live first-administrator creation.

The legacy staging-deployment trigger risk on merging
backend changes to main must be reviewed before merge.
No merge is authorized by this document.

## 11. Required review findings

The independent reviewer must explicitly decide:
1. Resource-group and inherited RBAC isolation
2. Exact dedicated workload and deployment identity
3. Table-level versus account-level data permissions
4. Effective legacy writer exclusion
5. Private endpoint/DNS routing and IP availability
6. Final authority schema and contention limits
7. Durable projection provenance and reader migration
8. Recovery and revocation behavior
9. Costs and monitoring
10. Reversibility without restoring revoked authority

Any unresolved authorization or credential bypass is a
stop condition.

## 12. Safety and decision record

Approved previously:
Separate authority storage and dedicated writer identity
as target architecture ONLY.

Not approved:
- New Azure resources or RBAC mutations
- Networking changes
- Authority writer execution
- Staff Authority activation
- Canonical Staff creation
- Graph invitations
- OAuth execution
- Automatic retry or recovery
- Production or original-staging changes
- Deployment or protected-main merge

Gate A result: DOCUMENT READY FOR INDEPENDENT REVIEW.
Infrastructure authorization: NOT GRANTED.
Staff creation authorization: NOT GRANTED.
