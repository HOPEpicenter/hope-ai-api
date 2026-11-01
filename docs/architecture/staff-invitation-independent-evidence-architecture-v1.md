# D6-B3: Staff Invitation Independent Evidence Architecture v1

Status: PROPOSED - NON-AUTHORIZING
Scope: Documentation and security design only
Baseline: D6-B2 squash commit f948d3b024154eecba16b8dfc86896ed96fc87c0
Production approval: NOT GRANTED

## 1. Purpose

Define independent evidence requirements for the six security
controls associated with the staff invitation intent storage
prototype.

This proposal does not establish that any production Azure
resource satisfies these controls.

No storage account, table, workload identity, deployment
topology, retention duration, or logging destination is approved
by this document.

## 2. Existing contract boundary

The D6 storage security contract evaluates caller-supplied
boolean claims.

D6-B1 evaluates caller-supplied evidence references and
observations.

D6-B2 evaluates caller-supplied issuer and time claims
alongside D6-B1 provenance.

These contracts remain synthetic, advisory-only, and
non-authorizing.

A valid evidence reference is not an authenticated attestation.
A claimed trusted issuer is not an authenticated issuer.
A supplied timestamp is not trusted-clock evidence.
A successful structural assessment is not Azure compliance.

No existing result may authorize storage access, invitation
execution, Graph operations, retries, recovery, or rollout.

## 3. Evidence trust model

Authoritative verification must be performed by a separately
approved and authenticated inspection process.

Evidence must be bound to:
- The exact Azure tenant and subscription.
- The intended environment and resource identifiers.
- The specific security requirement under inspection.
- An authenticated evidence source or independently verified
  inspection mechanism.
- An independently established observation time.
- An approved freshness window.
- A verification outcome and safe audit reference.

Caller-supplied fields alone cannot establish these properties.

The resource and identity inventory must be approved before
any inspection implementation is authorized.

Evidence from staging cannot automatically establish
production compliance.

## 4. Six-control evidence requirements

### C1 - Scoped storage identity

Required evidence:
- Approved target resource and environment inventory.
- Effective workload identity and credential mechanism.
- Independently established identity-resource binding.
- Evidence that unintended workloads cannot use equivalent
  credentials or bypass the intended boundary.

Potential sources:
- Azure resource and identity control-plane metadata.
- Approved workload configuration inspection.
- Independent permission-boundary verification.

Unknown or conflicting identity evidence remains UNVERIFIED.

### C2 - Least privilege

Required evidence:
- Direct and inherited effective RBAC assignments.
- Relevant data-plane roles and scope boundaries.
- Shared-key or connection-string bypass assessment.
- Other principals with effective write or administrative access.
- Independently observed negative-access boundary tests
  where separately authorized and safe.

Potential sources:
- Azure authorization metadata.
- Approved credential-custody inventory.
- Isolated permission verification evidence.

The existence of an RBAC role assignment alone is insufficient
to prove effective least privilege.

### C3 - Encryption at rest

Required evidence:
- Actual storage-account encryption settings.
- Applicable encryption scope and key-management configuration.
- Key availability and access-policy evidence where applicable.
- Independently verified resource and environment binding.

Potential sources:
- Azure storage configuration metadata.
- Approved key-management configuration evidence.

OAuth encryption contracts and synthetic Key Vault wrappers
do not independently establish invitation-storage protection.

### C4 - Diagnostic redaction

Required evidence:
- Inventory of invitation-related logging paths.
- Approved sensitive-data classification.
- Redaction tests covering names, email addresses, stored JSON,
  exceptions, structured fields, and diagnostic propagation.
- Independently inspected logging and telemetry configuration.
- Review of diagnostic destinations and access boundaries.

Potential sources:
- Targeted application security tests.
- Reviewed logging instrumentation.
- Approved diagnostic configuration inspection.

Generic logging helpers do not prove complete redaction.
No real personal information should be placed in test evidence.

### C5 - Retention policy

Required evidence:
- Formally approved retention and deletion requirements.
- Storage lifecycle or application enforcement design.
- Evidence of deletion behavior and exception handling.
- Treatment of backups, exports, and diagnostic copies.
- An authorized verification procedure for policy enforcement.

Potential sources:
- Approved ministry data-governance decision.
- Azure configuration evidence where applicable.
- Isolated lifecycle and deletion tests.

No duration or deletion mechanism is approved here.
Visitor follow-up retention logic is not evidence of invitation
intent storage retention enforcement.

### C6 - Access audit

Required evidence:
- Approved audit events and categories.
- Independently inspected diagnostic settings.
- Audit destination access and retention controls.
- Principal, operation, resource, time, and correlation metadata
  sufficient for approved forensic review.
- Evidence of collection availability and safe failure behavior.

Potential sources:
- Azure diagnostic configuration.
- Approved audit platform configuration.
- Independently reviewed synthetic audit tests.

Application audit or reconciliation data alone cannot prove
comprehensive storage-account access auditing.

## 5. Evidence lifecycle and freshness

The future inspection design must distinguish:
- Evidence not collected.
- Evidence unavailable.
- Evidence structurally invalid.
- Evidence contradictory.
- Evidence stale according to an approved trusted-clock policy.
- Evidence with an unverified issuer or resource binding.
- Independently verified evidence, only after the verification
  mechanism itself is approved and implemented.

No freshness duration is selected by this proposal.

Evidence records must not contain invitation recipient emails,
display names, credentials, access tokens, or storage secrets.

Only approved, minimal, non-sensitive audit references may be
retained in security assessment outputs.

## 6. Failure and authorization boundaries

All unknown, missing, stale, malformed, contradictory, or
unverifiable evidence fails closed.

An independently verified storage control, if implemented in
the future, must not by itself authorize invitation delivery.

Execution authorization requires a separate, approved
authorization design and explicit rollout decision.

No inspection result may automatically trigger:
- A storage write or deletion.
- Microsoft Graph invitation execution.
- Retry of an uncertain write.
- Automatic reconciliation or recovery mutation.
- Feature-flag activation.
- Production deployment.

## 7. Proposed verification sequence

Gate 1: Approve inventory of target resources, environments,
workload identities, and evidence owners.

Gate 2: Approve verification mechanisms and permissions for
each of the six controls.

Gate 3: Define independent trust roots, authenticated evidence
acquisition, clock and freshness rules, and safe audit records.

Gate 4: Implement isolated, non-authorizing verification tests
and independently review their results.

Gate 5: Review privacy, credential custody, logging, and
retention implications.

Gate 6: Obtain a separate explicit production architecture and
operational authorization before any live integration.

Completing an earlier gate does not imply approval of a later one.

## 8. Current evidence status

C1 Scoped storage identity: UNVERIFIED
C2 Least privilege: UNVERIFIED
C3 Encryption at rest: UNVERIFIED
C4 Diagnostic redaction: UNVERIFIED
C5 Retention enforcement: UNVERIFIED
C6 Access audit: UNVERIFIED

This status reflects the D6 evidence-review scope.
It does not assert that the corresponding Azure protections
are absent or disabled.

## 9. Related repository artifacts

- src/contracts/staffInvitationIntentStorageSecurity.v1.ts
- src/contracts/staffInvitationStorageEvidenceProvenance.v1.ts
- src/contracts/staffInvitationTrustedEvidenceBoundary.v1.ts
- src/repositories/staffInvitationIntentStoragePrototypeRepository.ts
- docs/architecture/p0-a2b4-storage-authority-isolation.md
- docs/security/oauth-credential-encryption-architecture-v1.md

## 10. Explicit non-goals

This document does not:
- Query or modify Azure resources.
- Retrieve production records or secrets.
- Grant or alter RBAC permissions.
- Create managed identities or Key Vault resources.
- Specify a production storage account or table.
- Activate invitation delivery.
- Integrate Microsoft Graph execution.
- Enable background retries or orchestrations.
- Change dashboard or backend runtime behavior.
- Authorize production deployment.

D6-B3 remains a documentation-only architecture proposal.
