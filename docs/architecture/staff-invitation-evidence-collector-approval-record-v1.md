# D6-B12: Staff Invitation Evidence Collector Approval Record v1

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Baseline: 97ddbc5d3e8b295f9a7770abf992561b40898a6b
S5 approval: NOT GRANTED
Azure inspection authorization: NOT GRANTED
Identity and RBAC operations authorization: NOT GRANTED
Storage operations authorization: NOT GRANTED
Microsoft Graph authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose

Prepare a decision-specific approval proposal for S5:
an independent staging staff-invitation evidence collector.

This document does not approve, identify as existing,
create, activate, or authorize any Azure principal.

No inspection permission or evidence collection is granted.
S5 remains OPEN.

## 2. Authoritative planning sources

- staff-invitation-azure-evidence-readiness-v1.md
- staff-invitation-evidence-collection-approval-scope-v1.md
- staff-invitation-staging-resource-approval-v1.md
- staff-invitation-staging-decision-matrix-v1.md
- staff-invitation-staging-approval-records-v1.md
- staff-invitation-staging-storage-approval-record-v1.md
- staff-invitation-runtime-identity-approval-record-v1.md

The staging decision matrix defines the S5 requirements.

The presence of repository workflows or deployment evidence
does not verify Azure access or establish approval.

## 3. S5 decision record

Decision: S5 - Independent evidence collector
Status: OPEN
Proposed principal: UNSELECTED
Collector owner: NOT APPOINTED
Security owner approval: NOT GRANTED
Independent reviewer approval: NOT GRANTED
Exact resource scope: UNAPPROVED
Permitted inspection operations: UNDECIDED
Effective RBAC: UNVERIFIED
Credential custody: UNVERIFIED
Evidence provenance: NOT ESTABLISHED

No existing or future identity is assumed authorized.

## 4. Separation of duties

### Deployment identity

Used for separately authorized deployment activities.

Deployment success is not evidence-collection authorization.

### Runtime identity

May be proposed for separately approved application
data-plane operations under S4.

Runtime identity must not be presumed suitable as the
independent evidence collector.

### Independent collector identity

Would perform only explicitly authorized, attributable,
narrowly scoped evidence inspection, if later approved.

Collector principal: UNSELECTED.
Collector permissions: NOT APPROVED.

### Independent reviewer

Assesses collector separation, evidence integrity,
and limitations without relying on the collector's
own assertion that permissions are appropriate.

No identity roles are interchangeable by default.

## 5. Proposed accountable authorities

Security administrator:
- Proposes identity and inspection scope.
- Reviews privilege boundaries and alternative access.
- Documents credential custody and revocation obligations.

Authorized resource owner:
- Confirms the exact staging resource boundary.
- Rejects unapproved or production-inclusive scope.

Data-governance owner:
- Defines protected information and redaction rules.
- Determines permissible evidence representations.

Independent reviewer:
- Confirms separation from deployment and runtime.
- Evaluates provenance and unresolved risk.
- Records an independently attributable decision.

These roles are proposals, not assignments.
No individual receives authority from this document.

## 6. Proposed inspection scope

Any future inspection must have an explicit written
resource-bound authorization and allowed-action list.

Potential evidence categories for future consideration:
- Non-secret resource configuration metadata.
- Approved, bounded identity and access metadata.
- Approved control configuration indicators.
- Authorized audit availability metadata.

These are illustrative categories, not permitted queries.

Subscription: UNAPPROVED.
Resource group: UNAPPROVED.
Function App: UNAPPROVED.
Storage account: UNAPPROVED.
Invitation table: UNAPPROVED.
Allowed operations: UNDECIDED.

The approved scope must explicitly exclude production.

No discovery of candidate resources is allowed merely
because the collector could technically enumerate them.

## 7. Read-only and data-plane boundaries

Read-only does not automatically mean safe.

A metadata query can reveal sensitive identifiers.
A data-plane read can expose personal invitation records.

Default prohibited operations:
- Reading invitation table records.
- Reading personal or visitor information.
- Retrieving secrets, tokens or connection strings.
- Retrieving storage account keys.
- Listing unrelated resources or identities.
- Writing data or modifying configuration.
- Assigning roles or creating identities.

Data-plane record reading: NOT AUTHORIZED.

Any proposed exception needs a separate explicit
owner-approved scope, privacy review, and independent
authorization before operations occur.

No exception is established by this proposal.

## 8. Evidence provenance requirements

A future collection plan must specify:
- Explicit owner-approved collection purpose.
- Trusted identity and its accountable owner.
- Exact resource identifiers from approved sources.
- Authorized operations and least-privilege rationale.
- Collection date and environment.
- Collection tool or method and evidence boundaries.
- Source and integrity information for each artifact.
- Independent reviewer attribution.
- Evidence handling, storage, and access restrictions.
- Known gaps, redactions, and verification limits.

Evidence collected outside an approved boundary must not
be treated as proof of control compliance.

## 9. Redaction and privacy requirements

Proposed evidence handling must prevent disclosure of:
- Access tokens and client secrets.
- Connection strings and account keys.
- Credentials within logs or configuration.
- Personal invitation or visitor information.
- Unnecessary identifiers or sensitive metadata.
- Production data or production-only configuration.

Redaction design: PENDING.
Authorized evidence repository: UNDECIDED.
Evidence access control: UNVERIFIED.

A redacted artifact must still retain enough provenance
for its intended verification purpose.

No sensitive values should be printed to ordinary
terminal output, pull requests, or approval logs.

## 10. Auditing and accountability requirements

A future evidence collector design should address:
- Collector authentication and attribution.
- Scope and duration of inspection authority.
- Approved operation inventory.
- Audit event coverage and retention.
- Access review and revocation.
- Failed or out-of-scope query handling.
- Separation of collector and reviewer duties.
- Independent confirmation of audit gaps.

Audit availability: UNVERIFIED.
Collector access audit: UNVERIFIED.
Effective permissions: UNVERIFIED.

Audit design approval does not establish that events
were actually captured.

## 11. Required evidence for future S5 approval

- Explicit security-owner approval of collector scope.
- Resource-owner confirmation of staging boundaries.
- Proposed independently attributable collector identity.
- Named accountable ownership through an approved process.
- Exact permitted read-only operations.
- Exact resource scope and excluded resources.
- Separation from runtime and deployment identities.
- Explicit data-plane record-reading prohibition.
- Credential custody and privilege-bypass assessment.
- Evidence provenance and chain-of-custody requirements.
- Approved redaction and privacy handling.
- Proposed audit and access-review obligations.
- Independent reviewer segregation-of-duties decision.
- Written outcome, restrictions and unresolved risks.

Actual Azure inspection requires separate authorization.

This documentation is not that authorization.

## 12. Proposed acceptance criteria

A future S5 design decision requires:

1. Authorized security owner confirms the scope.
2. Authorized resource owner confirms staging resources.
3. Collector principal and owner are attributable.
4. Least-privilege operations are explicitly enumerated.
5. Production resources are excluded.
6. Deployment identity is kept separate.
7. Runtime identity is kept separate.
8. Independent reviewer confirms segregation of duties.
9. No data-plane record reading is silently included.
10. Redaction and provenance requirements are accepted.
11. Audit and revocation expectations are documented.
12. Known bypass risks and evidence gaps are recorded.

None of these criteria is satisfied simply by
committing, reviewing, or merging this document.

Design approval is distinct from operational access.

## 13. Stop conditions

Stop if:

- Collector identity or owner is not attributable.
- The security owner has not approved inspection scope.
- Collector permissions exceed proposed inspection.
- Resource scope includes unapproved Azure resources.
- A production boundary cannot be excluded.
- Collector and runtime identities are conflated.
- Collector and deployment identities are conflated.
- Effective RBAC or credential custody is unknown.
- Any request could expose secrets or personal data.
- Data-plane record reading is silently included.
- Redaction or evidence provenance is insufficient.
- Audit or revocation expectations are undefined.
- Identity creation or role assignments are requested.
- Live Azure, Microsoft Graph or storage access is requested.

Missing approval requires HOLD.

## 14. Control traceability

C1 Scoped storage identity: UNVERIFIED.
C2 Least privilege and credential bypass: UNVERIFIED.
C3 Encryption at rest: UNVERIFIED.
C4 Diagnostic redaction: UNVERIFIED.
C5 Retention enforcement: UNVERIFIED.
C6 Access auditing: UNVERIFIED.

S5 prepares possible independent verification boundaries.
S5 does not verify C1-C6.

## 15. Prohibited operations

Until separately authorized:
- Do not enumerate Azure resources or identities.
- Do not inspect live RBAC or role assignments.
- Do not create or modify identity credentials.
- Do not grant permissions or change app settings.
- Do not inspect storage accounts or invitation tables.
- Do not read data-plane invitation records.
- Do not retrieve secrets or personal data.
- Do not invoke Microsoft Graph invitation operations.
- Do not activate any runtime features.
- Do not perform manual deployments.
- Do not inspect or modify production resources.

Existing CI and staging workflow success does not
establish permission to perform any of these actions.

## 16. Final non-authorizing declaration

S1: OPEN
S2: OPEN
S3: OPEN
S4: OPEN
S5: OPEN
S6: OPEN
S7: OPEN

C1-C6: UNVERIFIED

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
S5 approval: NOT GRANTED
Azure inspection authorization: NOT GRANTED
Identity and RBAC operations authorization: NOT GRANTED
Storage operations authorization: NOT GRANTED
Microsoft Graph authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

No collector identity is selected or authorized.
No Azure permission is assigned or approved.
No live Azure control is verified.
