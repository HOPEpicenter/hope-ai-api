# D6-B5: Staff Invitation Azure Evidence Readiness v1

Status: PROPOSED - NON-AUTHORIZING
Scope: Repository evidence inventory and future verification prerequisites only
Baseline: a6f209ada34dab94954222f5c04915e3b5da2afc
Production architecture approval: NOT GRANTED
Live Azure verification: NOT PERFORMED

## 1. Purpose

Record the evidence-readiness gaps for independently assessing
the six staff-invitation intent storage security controls.

This document does not approve an Azure storage resource,
table, workload identity, credential mechanism, retention
duration, logging destination, or production deployment.

It does not establish that any actual Azure resource satisfies
the six controls.

## 2. Verified repository findings

The findings below are based on read-only repository inspections
at the exact baseline identified above.

### F1 - Invitation storage prototype

The repository contains:

- src/repositories/staffInvitationIntentStoragePrototypeRepository.ts
- tests/authorization/staffInvitationIntentStoragePrototype.test.ts

The prototype accepts an injected Azure TableClient.

It implements create-only recording and read/compare behavior,
but these operations are not independent security authorization.

Its stored JSON may include display names and recipient email
addresses. Production use therefore requires separate privacy,
access-control, retention, and diagnostic review.

### F2 - Integration reference inventory

Repository-wide tracked-source searches found the prototype
class and import path in the prototype implementation and tests.

The prototype storage partition and source identifiers appeared
in the same implementation and tests.

The D6-B4 evidence-verification function appeared in its contract
and synthetic tests.

No direct runtime use of those named prototype interfaces was
identified by the searches performed.

This finding is scoped to the searched identifiers and repository
revision. It is not a proof that every indirect or dynamic
integration is absent.

### F3 - Shared storage construction

Shared storage utilities exist at:

- src/shared/storage/resolveStorageConnectionString.ts
- src/shared/storage/makeTableClient.ts

These utilities support connection-string-based Table clients
and are referenced by other storage repositories.

The inspected invitation execution paths did not show a direct
dependency on the invitation prototype or these shared utilities
through the targeted search patterns.

The existence of shared connection-string utilities does not
prove that the invitation prototype uses them.

Credential distribution, effective authority, and any shared-key
bypass remain unverified.

### F4 - Existing D6 security boundaries

The following repository artifacts remain synthetic or
non-authorizing:

- src/contracts/staffInvitationIntentStorageSecurity.v1.ts
- src/contracts/staffInvitationStorageEvidenceProvenance.v1.ts
- src/contracts/staffInvitationTrustedEvidenceBoundary.v1.ts
- src/contracts/staffInvitationEvidenceVerificationBoundary.v1.ts

These contracts do not independently authenticate evidence
issuers, establish trusted observation time, inspect Azure
resource configuration, or verify effective Azure permissions.

They do not authorize storage access, invitation delivery,
Microsoft Graph operations, retries, recovery, or rollout.

### F5 - Prior architecture proposals

The existing documents are:

- docs/architecture/staff-invitation-independent-evidence-architecture-v1.md
- docs/architecture/p0-a2b4-storage-authority-isolation.md

Both proposals require independent verification and separate
approval before infrastructure or runtime changes.

## 3. Azure resource and identity inventory gaps

The following items remain UNKNOWN or UNAPPROVED:

- Exact Azure tenant and subscription for invitation storage.
- Intended environment and Azure storage account.
- Intended storage table and applicable data classification.
- Approved workload identity and credential mechanism.
- Principal-to-resource binding and effective permission scope.
- Credential distribution and shared-key bypass exposure.
- Independent inspection identity and approved read permissions.
- Evidence collection owner and independent security reviewer.
- Approved observation-time source and evidence freshness policy.
- Approved diagnostic and audit destinations.
- Approved retention and deletion policy.

No names, resource IDs, account keys, connection strings,
secrets, or personally identifying records are included here.

## 4. Six-control evidence readiness matrix

### C1 - Scoped storage identity

Status: UNVERIFIED

Required evidence:
- Approved resource and environment inventory.
- Independently established workload-to-resource binding.
- Credential custody and alternative-access-path review.
- Evidence that unintended workloads cannot bypass isolation.

Proposed evidence owner: Azure infrastructure administrator.

### C2 - Least privilege

Status: UNVERIFIED

Required evidence:
- Effective direct and inherited RBAC assignments.
- Relevant data-plane and administrative access.
- Shared account key and connection-string bypass assessment.
- Separately authorized negative-access verification.

Proposed evidence owner: Azure security administrator.

### C3 - Encryption at rest

Status: UNVERIFIED

Required evidence:
- Actual storage-account encryption configuration.
- Applicable encryption scope and key-management settings.
- Independently confirmed target resource and environment.

Proposed evidence owner: Azure infrastructure administrator.

### C4 - Diagnostic redaction

Status: UNVERIFIED

Required evidence:
- Inventory of invitation logging and telemetry paths.
- Sensitive-field classification and synthetic redaction tests.
- Review of exception, structured-log, and diagnostic handling.
- Diagnostic destination and access-boundary assessment.

Proposed evidence owner: Backend security reviewer.

### C5 - Retention enforcement

Status: UNVERIFIED

Required evidence:
- Formally approved retention requirements.
- Applicable lifecycle or application deletion mechanism.
- Verification of deletion, exceptions, backups, and exports.
- Review of diagnostic and audit-data retention.

Proposed evidence owner: Ministry data-governance owner.

### C6 - Access auditing

Status: UNVERIFIED

Required evidence:
- Approved storage-access audit events and metadata.
- Independently inspected diagnostic configuration.
- Evidence collection and availability verification.
- Audit-destination access and retention controls.

Proposed evidence owner: Security and operations owner.

The owners above are proposals, not recorded appointments.

## 5. Trust and evidence restrictions

A caller-supplied resource identifier is not resource proof.

A claimed authenticated issuer is not authenticated evidence.

A caller-supplied time is not an independently established
trusted clock.

A valid evidence reference is not an attestation.

A nominal role assignment alone is not proof of effective
least privilege.

Staging evidence does not establish production compliance.

No synthetic result may be interpreted as authorization.

Any missing, stale, contradictory, unavailable, or unverified
evidence must remain non-authorizing.

## 6. Proposed approval gates

Gate 1: Approve the exact resource, environment, identity,
and evidence-owner inventory.

Gate 2: Review credential custody, effective access scope,
and possible shared-key or connection-string bypasses.

Gate 3: Approve inspection mechanisms, permissions, trust
roots, observation-time source, and freshness policy.

Gate 4: Perform separately authorized, read-only collection
of non-secret Azure configuration evidence.

Gate 5: Independently review all six control assessments,
privacy risks, diagnostics, retention, and audit evidence.

Gate 6: Resolve deficiencies through separate change control
and demonstrate any required negative-access tests safely.

Gate 7: Obtain explicit production architecture and operational
approval before any storage or invitation integration.

Completion of one gate does not approve later gates.

## 7. Verification boundaries for a future inspection

Any future Azure inspection must:

- Be explicitly authorized for specific resource scopes.
- Prefer read-only control-plane inspection where sufficient.
- Avoid displaying or exporting secrets or connection strings.
- Avoid reading or modifying visitor or staff records.
- Avoid creating, altering, or deleting Azure resources.
- Avoid modifying role assignments or workload identities.
- Avoid Microsoft Graph invitation operations.
- Avoid logging real personal information.
- Preserve approved evidence provenance and safe audit records.
- Distinguish verified configuration from inferred behavior.

This document does not itself authorize such an inspection.

## 8. Outstanding decisions

D1. Which environment and resource are proposed for storage?

D2. Which principal and credential mechanism would access it?

D3. Can inherited permissions, account keys, or shared
connection strings bypass the intended isolation?

D4. Who approves evidence collection and independently
reviews the resulting security assessment?

D5. What retention and deletion requirements are approved?

D6. Which non-sensitive diagnostic and access-audit records
are required, and where may they be retained?

D7. What objective evidence is sufficient to close each
of the six security-control findings?

All decisions remain open.

## 9. Explicit non-goals

This milestone does not:

- Create or select production Azure resources.
- Validate live Azure security configurations.
- Grant storage, RBAC, or Key Vault permissions.
- Access, expose, or rotate credentials.
- Read or mutate invitation storage records.
- Integrate the prototype into active runtime routes.
- Perform Microsoft Graph invitations.
- Enable execution, retry, or automatic recovery.
- Activate feature flags.
- Deploy to production.
- Approve production rollout.

## 10. Final readiness declaration

D6-B5 documents repository evidence and future verification
requirements only.

C1 Scoped storage identity: UNVERIFIED
C2 Least privilege: UNVERIFIED
C3 Encryption at rest: UNVERIFIED
C4 Diagnostic redaction: UNVERIFIED
C5 Retention enforcement: UNVERIFIED
C6 Access auditing: UNVERIFIED

UNVERIFIED does not mean that a control is absent or disabled.
It means independent evidence has not yet been established.

Status: PROPOSED - NON-AUTHORIZING
Production approval: NOT GRANTED
