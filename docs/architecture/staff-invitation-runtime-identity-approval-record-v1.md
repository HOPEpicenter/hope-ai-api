# D6-B11: Staff Invitation Runtime Identity Approval Record v1

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Baseline: 257b0d3c565e59d3fc4e0b30635b6447bd96c763
S4 approval: NOT GRANTED
Azure inspection authorization: NOT GRANTED
Identity and RBAC operations authorization: NOT GRANTED
Storage operations authorization: NOT GRANTED
Microsoft Graph authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose

Prepare a decision-specific approval proposal for S4:
the staging staff-invitation runtime workload identity.

This document records requirements for a possible future
runtime identity design. It neither chooses nor authorizes
any Azure principal, credential mechanism or permission.

S4 remains OPEN.

## 2. Authoritative planning sources

- staff-invitation-azure-evidence-readiness-v1.md
- staff-invitation-evidence-collection-approval-scope-v1.md
- staff-invitation-staging-resource-approval-v1.md
- staff-invitation-staging-decision-matrix-v1.md
- staff-invitation-staging-approval-records-v1.md
- staff-invitation-staging-storage-approval-record-v1.md

The staging decision matrix is authoritative for the
S4 evidence, acceptance criteria and stop conditions.

Existing documentation or deployment success does not
prove that a proposed runtime identity exists.

## 3. Decision and status

Decision: S4 - Runtime workload identity
Status: OPEN
Design approval: NOT GRANTED
Runtime identity: UNSELECTED
Credential mechanism: UNSELECTED
Effective RBAC: UNVERIFIED
Credential custody: UNVERIFIED
Storage resource scope: UNAPPROVED
Production access: NOT AUTHORIZED

S1, S2 and S3 are unresolved prerequisites.

No runtime-to-storage resource binding is established
by this proposal.

## 4. Separation of identity purposes

### Staging deployment identity

Purpose: deployment of authorized application artifacts.

Its authentication success does not establish authority
to access invitation records at runtime.

Deployment principal: NOT VERIFIED BY THIS RECORD.

### Runtime workload identity

Purpose: possible application data-plane access required
for a separately approved staff-invitation feature.

Runtime principal: UNSELECTED.
Permissions: UNAPPROVED.
Storage binding: UNAPPROVED.

### Independent evidence-collection identity

Purpose: independently authorized, read-limited evidence
collection within a separately approved scope.

Evidence collector: UNSELECTED.
S5 decision: OPEN.

No one identity should be presumed interchangeable
with another merely because credentials are available.

## 5. Proposed accountable authorities

Backend owner:
- Defines the application's necessary data-plane operations.
- Identifies proposed runtime integration boundaries.
- Documents failure behavior and credential handling.

Security administrator:
- Reviews the proposed authentication mechanism.
- Evaluates least privilege and alternate access paths.
- Assesses credential and privilege escalation risks.

Resource and storage owners:
- Confirm proposed staging resource ownership and scope.
- Review the requested account and table boundaries.

Independent reviewer:
- Records accepted design evidence and unresolved risks.
- Confirms separation of identity purposes.

These are proposed roles, not assigned authorities.

No person, service principal or managed identity
receives access from this document.

## 6. Proposed credential mechanisms

### Option A - Managed workload identity

Proposal only.

Potential considerations:
- Environment-bound managed identity.
- Explicit identity-to-resource mapping.
- No embedded reusable storage account secrets.
- Narrow, resource-scoped data-plane permissions.
- Credential-free application configuration where possible.

Selection: NOT MADE.
Identity existence: UNVERIFIED.
Effective permissions: UNVERIFIED.

### Option B - Another explicitly authorized mechanism

Proposal only.

Potential considerations:
- Documented owner and credential custody.
- Rotation and revocation obligations.
- Exposure and replay risks.
- Elimination or mitigation of privilege bypass.
- Independent approval of any residual risk.

Selection: NOT MADE.
Credential custody: UNVERIFIED.
Approval: NOT GRANTED.

No mechanism is approved by listing it here.

## 7. Required storage data-plane permissions

The backend owner must document the minimum actions
required by the separately authorized application design.

Potential action categories to assess:
- Read invitation records, if necessary.
- Create invitation records, if necessary.
- Update permitted invitation state, if necessary.
- Delete records only under approved retention rules.

These examples are questions for assessment,
not permissions granted or requested for execution.

Required actions: UNDECIDED.
Resource scope: UNAPPROVED.
Table scope: UNAPPROVED.
Effective data-plane RBAC: UNVERIFIED.

Broad subscription, resource-group or account-level
authority must not be assumed necessary.

Management-plane deployment authority is not proof
of data-plane runtime permission.

## 8. Credential and alternate-path threat assessment

Required review topics:

- Storage account-key authentication pathways.
- Connection-string storage and distribution.
- Shared-key and inherited access alternatives.
- Broad account-level credentials.
- Privileged identity or role escalation.
- Credential reuse between staging and production.
- Deployment secrets accessible to runtime code.
- Legacy fallback paths outside proposed RBAC.
- Logs and diagnostics that could reveal credentials.
- Local development credentials used in staging.
- Implicit permissions inherited by existing identities.

The reviewers must identify whether any path can bypass
the proposed runtime least-privilege design.

Assessment status: NOT PERFORMED.
Known effective access: UNVERIFIED.
Credential bypass risks: UNRESOLVED.

Do not infer safety from the absence of a credential
reference in source code or deployment workflows.

## 9. Required evidence for future S4 decision

- Approved S1 staging environment scope.
- Approved S2 Function App resource boundary.
- Approved S3 storage architecture and governance scope.
- Proposed runtime principal with trusted provenance.
- Proposed credential mechanism and accountable owner.
- Defined runtime data-plane actions.
- Exact proposed account and table boundaries.
- Demonstrated separation from deployment identity.
- Separately scoped S5 evidence-collector requirements.
- Account-key and connection-string threat assessment.
- Alternate access and inherited privilege analysis.
- Credential custody and revocation design.
- Documented least-privilege rationale.
- Independent review of remaining bypass risks.
- Explicit written decision and its limitations.

Gathering actual Azure evidence requires separate,
resource-bound authorization.

No resource enumeration, effective RBAC query,
credential retrieval or identity operation is
authorized here.

## 10. Proposed acceptance criteria

A future S4 design decision requires:

1. Backend-owner acceptance of required runtime actions.
2. Security-owner acceptance of least privilege.
3. Authorized staging resource-owner confirmation.
4. Explicit runtime principal and credential proposal.
5. Resource scope limited to approved S1-S3 boundaries.
6. Identity separation from deployment principal.
7. Identity separation from evidence collector.
8. Review of account-key and connection-string bypass.
9. Review of effective RBAC and credential custody gaps.
10. Independent reviewer record of unresolved bypass risks.
11. Written outcome with residual risks and restrictions.

This proposal satisfies none of these criteria merely
by being committed or merged.

Design approval alone would not authorize implementation,
privilege assignment, runtime use or storage access.

## 11. Stop conditions

Stop if:

- Effective RBAC is unknown when access is proposed.
- Credential custody or rotation ownership is unknown.
- Runtime principal ownership cannot be established.
- Deployment identity is presumed to permit runtime access.
- Evidence-collector identity is treated as runtime identity.
- Storage account or table is unapproved.
- Production or staging boundaries are ambiguous.
- Storage account keys or connection strings are exposed.
- Alternate access paths are not assessed.
- A broad role is proposed without documented necessity.
- Identity creation or privilege assignment is requested.
- Live Azure resource or RBAC inspection is requested.
- Microsoft Graph invitation operations are requested.
- Runtime feature activation is requested.
- Independent review or provenance is missing.

Any such condition requires HOLD until separately
authorized and resolved.

## 12. Control traceability

C1 Scoped storage identity: UNVERIFIED.
C2 Least privilege and credential bypass: UNVERIFIED.
C3 Encryption at rest: UNVERIFIED.
C4 Diagnostic redaction: UNVERIFIED.
C5 Retention enforcement: UNVERIFIED.
C6 Access auditing: UNVERIFIED.

S4 planning focuses on C1 and C2.

It does not verify C1, C2 or any other control.

## 13. Prohibited operations

Until separately authorized:

- Do not query Azure identities or resources.
- Do not inspect effective Azure RBAC.
- Do not list role assignments.
- Do not create or modify managed identities.
- Do not assign or elevate Azure roles.
- Do not retrieve storage account keys.
- Do not retrieve connection strings or app secrets.
- Do not read or mutate invitation records.
- Do not change Azure application settings.
- Do not deploy infrastructure manually.
- Do not invoke Microsoft Graph invitations.
- Do not enable runtime feature flags.
- Do not inspect or change production resources.

GitHub review, CI and automatic staging deployment
do not establish operational permission or control
verification.

## 14. Final non-authorizing declaration

S1: OPEN
S2: OPEN
S3: OPEN
S4: OPEN
S5-S7: OPEN

C1-C6: UNVERIFIED

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
S4 approval: NOT GRANTED
Azure inspection authorization: NOT GRANTED
Identity and RBAC operations authorization: NOT GRANTED
Storage operations authorization: NOT GRANTED
Microsoft Graph authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

No runtime principal is selected or authorized.
No privilege is assigned or approved.
No live Azure control is verified.

This remains a documentation-only planning record.
