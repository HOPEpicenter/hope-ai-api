# D6-B7: Staff Invitation Staging Resource Approval Proposal v1

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Baseline: 6e21d5e51d05057d6bd1fcbbdb6dafa60278592c
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose

Define a staging-only candidate inventory and approval boundary
for future independent Azure staff-invitation storage evidence
collection.

This proposal does not approve an Azure resource, workload
identity, evidence collector, credential, permission assignment,
storage integration, or inspection operation.

Production resources and production inspection are out of scope.

## 2. Repository evidence

Read-only repository inspection at the stated baseline found
the following in .github/workflows/deploy-staging.yml:

- GitHub OIDC permission declaration.
- Azure login action.
- Federated deployment identity setting references.
- Staging GitHub environment declaration.
- Azure Function App and resource-group operation references.
- Subscription and tenant/client identity setting references.

Targeted inspection did not identify:

- Runtime managed identity configuration.
- Invitation-specific storage account or table configuration.
- Runtime storage credential configuration.
- Azure role assignment inspection or change commands.

These findings concern the inspected workflow only.

Absence of a search match does not prove that a resource,
identity, permission, or alternate code path does not exist.

Repository references are not independent evidence of live
Azure resource configuration.

## 3. Staging candidate categories

The following are categories, not approved resource instances.

Candidate A - Existing staging Function App deployment target.

Evidence: Deployment workflow contains Function App operations.

Unresolved: Exact approved resource binding, deployment principal,
and relationship to any invitation storage resource.

Candidate B - Staging resource group and subscription.

Evidence: Deployment workflow contains references to these
configuration categories.

Unresolved: Independently established resource ownership,
subscription boundary, and inspection authorization.

Candidate C - Staff-invitation storage account and table.

Evidence: No invitation-specific storage target established
through the targeted staging workflow inspection.

Unresolved: Whether a dedicated resource exists, should exist,
or has been approved by the appropriate owner.

Candidate D - Application runtime workload identity.

Evidence: No runtime managed identity setup established by
the targeted staging workflow inspection.

Unresolved: Actual runtime authentication mechanism, effective
authority, and storage data access.

Candidate E - Independent evidence collection identity.

Evidence: No approved collector established in this milestone.

Unresolved: Collector identity, narrow read permissions,
independent reviewer, audit destination, and retention policy.

## 4. Three distinct identity boundaries

### Identity 1 - Staging deployment identity

Purpose: Authenticate the GitHub deployment workflow.

Current status: Repository configuration references identified.

Unknown: Effective Azure permissions and resource scope.

A deployment identity is not automatically an authorized
storage data reader or evidence collection principal.

### Identity 2 - Application runtime identity

Purpose: Access application resources if separately approved.

Current status: UNVERIFIED for invitation-specific storage.

Unknown: Principal, credential mechanism, effective storage
authority, and alternative account-key access paths.

### Identity 3 - Evidence collection identity

Purpose: Independently inspect approved security configuration
within a narrowly authorized staging scope.

Current status: NOT APPROVED.

Unknown: Collector principal, evidence source, allowed operations,
effective permissions, and oversight requirements.

Identity 1, Identity 2, and Identity 3 must not be conflated.

Approval for one identity does not grant approval for another.

## 5. Staging resource approval matrix

Resource environment: STAGING ONLY - proposed boundary.

Azure tenant: UNAPPROVED / UNVERIFIED.
Azure subscription: UNAPPROVED / UNVERIFIED.
Resource group: UNAPPROVED / UNVERIFIED.
Function App resource: CANDIDATE / UNVERIFIED.
Invitation storage account: UNAPPROVED / UNVERIFIED.
Invitation storage table: UNAPPROVED / UNVERIFIED.
Runtime workload identity: UNAPPROVED / UNVERIFIED.
Evidence collection identity: UNAPPROVED / UNVERIFIED.
Effective RBAC: UNVERIFIED.
Credential bypass paths: UNVERIFIED.
Audit destination: UNAPPROVED / UNVERIFIED.
Retention policy: UNAPPROVED / UNVERIFIED.

No real resource identifiers are approved by this document.

## 6. Six control evidence requirements

C1 Scoped storage identity: UNVERIFIED.
Requires independently bound workload and resource evidence.

C2 Effective least privilege: UNVERIFIED.
Requires effective RBAC and shared-key bypass assessment.

C3 Encryption at rest: UNVERIFIED.
Requires independently verified staging storage encryption.

C4 Diagnostic redaction: UNVERIFIED.
Requires logging-path inventory and synthetic redaction tests.

C5 Retention enforcement: UNVERIFIED.
Requires formally approved retention and deletion requirements.

C6 Access auditing: UNVERIFIED.
Requires independent diagnostic and audit-coverage evidence.

No C1-C6 finding can be marked verified based only on
the staging deployment workflow or this proposal.

## 7. Proposed approval responsibilities

Resource owner:
Identify and approve the exact staging resources and environment.

Azure infrastructure administrator:
Verify configuration authority and proposed inspection boundaries.

Azure security administrator:
Assess effective RBAC, credential custody, and bypass risks.

Backend owner:
Review application runtime storage dependencies and logging.

Data-governance owner:
Approve retention and personal-data requirements.

Independent reviewer:
Approve the proposed scope and subsequently review evidence.

These are role proposals, not authority assignments.

## 8. Required approval before any Azure inspection

Gate A - Exact staging resource and environment inventory approved.

Gate B - Deployment, runtime, and inspection identities
distinguished and approved for their separate purposes.

Gate C - Effective permission requirements, credential
custody, and alternate access paths reviewed.

Gate D - Exact read-only inspection operations, output fields,
trusted time source, freshness criteria, and redaction approved.

Gate E - Evidence collector, independent reviewer, audit
destination, retention, and stop conditions approved.

Each gate requires its own recorded decision.

Merging this document does not approve any gate.

## 9. Prohibited operations

Without separate specific authorization:

- Do not query Azure subscription or resource inventories.
- Do not inspect live Azure identity or RBAC assignments.
- Do not retrieve application settings, secrets, or tokens.
- Do not read, create, modify, or delete storage records.
- Do not create or configure storage accounts or tables.
- Do not assign or change Azure roles or workload identities.
- Do not run Microsoft Graph invitation or activation operations.
- Do not modify feature flags, runtime services, or deployments.
- Do not inspect production Azure environments.
- Do not activate production staff-invitation storage.

No automatic recovery or retry behavior is authorized.

## 10. Stop conditions

Stop any future evidence request or collection when:

- The resource owner or approving authority is unknown.
- The requested environment is not explicitly staging.
- The resource or inspection identity is not approved.
- Required permissions exceed the approved scope.
- Credential custody or shared-key bypass is unresolved.
- Operations might reveal credentials or personal records.
- Evidence issuer, resource binding, or freshness is untrusted.
- The request unexpectedly includes a production resource.
- An operation would modify infrastructure or data.

Do not substitute available administrator permissions for
the narrower permissions required by an approved inspection.

## 11. Open staging decisions

S1. What exact staging subscription and resource group
may be proposed for future inspection?

S2. Which existing staging Function App belongs to the scope?

S3. Is dedicated invitation storage proposed, and by whom?

S4. Which identity would access invitation storage at runtime?

S5. Which independent identity could collect control evidence?

S6. Who has authority to approve scope, retention, and audit?

S7. What exact non-secret outputs and acceptance criteria
would be permitted in a future inspection?

All seven staging decisions remain OPEN.

## 12. Final declaration

The D6-B7 proposal is staging-only and non-authorizing.

No Azure resources have been independently inspected.

No workload or evidence-collector principal has been approved.

All six Azure storage security controls remain UNVERIFIED.

No permission changes, storage operations, Graph invitations,
runtime integrations, or production activations are authorized.

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED
