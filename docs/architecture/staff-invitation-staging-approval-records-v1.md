# D6-B9: Staff Invitation Staging Approval Records v1

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Baseline: 4ded14913a586573b8209801c15614fe5fde3a37
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose

Prepare decision-specific approval records for S1 and S2.

This document records proposed responsibilities, required
evidence, acceptance criteria, unresolved decisions and
stop conditions.

It does not approve resources, identify verified Azure
configuration, grant authority or authorize operations.

No decision is approved by creating, reviewing or merging
this document.

## 2. Authoritative planning sources

- staff-invitation-azure-evidence-readiness-v1.md
- staff-invitation-evidence-collection-approval-scope-v1.md
- staff-invitation-staging-resource-approval-v1.md
- staff-invitation-staging-decision-matrix-v1.md

These documents are planning inputs only.

Repository configuration references may identify candidates.
They do not independently verify Azure resource existence,
ownership, security configuration or operational authority.

## 3. S1 - Staging subscription and resource group

Decision status: OPEN
Approval status: NOT GRANTED

### Proposed authorities

- Resource owner: confirms exact staging resource scope.
- Azure infrastructure administrator: advises on resource
  boundaries and configuration authority.
- Independent reviewer: records an independent scope decision.

These are proposed roles, not appointments.

No named person, service principal or Azure identity is
granted authority by this record.

### Required evidence

- Proposed Azure tenant and subscription identifiers.
- Proposed resource-group identifier.
- Explicit staging environment classification.
- Authorized resource-owner confirmation.
- Written declaration excluding production resources.
- Source, issuer, observation or approval date, and
  controlled record reference.
- Independent review record identifying the exact scope.

Identifiers must be supplied through an approved channel.

Repository references alone are insufficient evidence.

No live resource discovery is authorized.

### Acceptance criteria

A future S1 decision may be accepted only when:

1. An authorized resource owner confirms exact scope.
2. The environment is explicitly staging only.
3. Production overlap is explicitly excluded.
4. Evidence provenance and resource binding are recorded.
5. An independent reviewer records the exact decision.
6. Approval scope and restrictions are documented.

Meeting these criteria requires actual supporting records.
This proposal does not assert they have been met.

### Outstanding decisions

- Exact tenant and subscription: UNAPPROVED.
- Exact resource group: UNAPPROVED.
- Authorized resource owner: NOT RECORDED.
- Independent scope reviewer: NOT RECORDED.
- Written resource-bound approval: NOT PRESENT.

### Stop conditions

Stop if:

- Owner or approving authority is unknown.
- Scope is ambiguous or includes production.
- Resource identifiers are untrusted.
- Independent approval is missing.
- Evidence provenance cannot be established.
- An Azure query is proposed merely to discover candidates.
- Any activity exceeds documentation-only planning.

S1 remains OPEN.

## 4. S2 - Staging Function App ownership and boundary

Decision status: OPEN
Approval status: NOT GRANTED
Dependency: S1 staging resource scope.

### Proposed authorities

- Resource owner: confirms Function App ownership and scope.
- Backend owner: identifies application deployment references.
- Azure infrastructure administrator: advises on boundary
  and configuration authority.
- Independent reviewer: records the resource-binding decision.

These are proposed responsibilities only.

### Required evidence

- Candidate Function App references from existing repository
  deployment documentation.
- Explicit owner-confirmed association with S1 scope.
- Staging-only environment classification.
- Exact non-secret resource-binding record.
- Deployment identity and its proposed purpose.
- Runtime workload identity and its proposed purpose.
- Explicit separation of deployment, runtime and future
  independent evidence-collection identities.
- Written independent review of the proposed boundary.

Existing workflow references are candidate information,
not independent confirmation of live Azure state.

### Acceptance criteria

A future S2 decision may be accepted only when:

1. S1 scope has an independently recorded approval.
2. An authorized owner confirms the exact Function App.
3. The Function App is bound to the approved staging scope.
4. Production resources are excluded.
5. Deployment and runtime authorities are distinguished.
6. An independent reviewer records acceptance of the
   non-secret Function App binding.
7. The record identifies limitations and unresolved risks.

Approval of S2 would not independently verify storage
security controls or authorize storage access.

### Outstanding decisions

- Exact approved Function App: UNVERIFIED.
- Owner-confirmed S1 resource binding: NOT PRESENT.
- Runtime principal and credentials: UNVERIFIED.
- Effective runtime storage authority: UNVERIFIED.
- Independent reviewer acceptance: NOT PRESENT.

### Stop conditions

Stop if:

- S1 is unresolved.
- Function App ownership is unknown.
- Resource or environment binding is ambiguous.
- Production overlap cannot be excluded.
- Deployment authentication is treated as runtime authority.
- Runtime and inspection identities are conflated.
- Evidence includes secrets or personal records.
- Any live Azure inspection is requested without approval.

S2 remains OPEN.

## 5. Proposed decision-record requirements

Each future approval record must identify:

- Decision identifier and version.
- Exact authorized staging scope.
- Requesting owner and accountable approving authority.
- Independently attributable reviewer.
- Evidence source and reference.
- Trusted issuer and recorded decision time.
- Specific acceptance criteria and findings.
- Restrictions, exclusions and unresolved risks.
- Explicit approval outcome.
- Audit destination and retention responsibility.

No approval outcome may be recorded as GRANTED unless
its supporting authorization evidence is available.

Missing, contradictory, stale or untrusted evidence
requires HOLD rather than presumed approval.

## 6. Dependencies and control traceability

S1 must be independently resolved before S2 acceptance.

S1 informs proposed C1, C2, C3 and C6 evidence scopes.
S2 informs proposed C4 diagnostic boundary evidence.

Neither decision establishes control verification.

S3-S7 remain OPEN.
C1-C6 remain UNVERIFIED.

S1 and S2 approval would not independently authorize
live Azure inspection, runtime permissions, evidence
collection or production activation.

A separate, explicit authorization remains necessary.

## 7. Prohibited operations

Until independently authorized:

- Do not query live Azure resources.
- Do not enumerate subscriptions or resource groups.
- Do not inspect Azure identity or effective RBAC.
- Do not retrieve secrets, tokens or connection strings.
- Do not inspect application settings.
- Do not access or modify invitation storage records.
- Do not create or alter Azure infrastructure.
- Do not change permissions or identities.
- Do not perform Microsoft Graph invitation operations.
- Do not activate runtime integration or feature flags.
- Do not perform manual deployment.
- Do not inspect or modify production resources.

Successful GitHub CI or staging deployment does not
constitute independent Azure security verification.

## 8. Final declaration

S1: OPEN
S2: OPEN
S3-S7: OPEN

C1 Scoped storage identity: UNVERIFIED
C2 Least privilege and bypass: UNVERIFIED
C3 Encryption at rest: UNVERIFIED
C4 Diagnostic redaction: UNVERIFIED
C5 Retention enforcement: UNVERIFIED
C6 Access auditing: UNVERIFIED

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

Approval records remain proposed until independently
supported decisions are explicitly recorded.
