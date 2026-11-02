# D6-B6: Staff Invitation Evidence Collection Approval Scope v1

Status: PROPOSED - NON-AUTHORIZING
Baseline: 47b1ee2668ecf17bc42847d0d5176d19f33c3782
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose

Define the prerequisites for requesting independently authorized
collection of evidence concerning staff-invitation intent storage.

This document is a proposal for approval boundaries only.

It does not identify an approved Azure resource, approve a
workload identity, grant inspection rights, or authorize access
to live storage configuration, records, or Microsoft Graph.

The six security controls remain UNVERIFIED.

## 2. Source architecture and scope

This proposal follows:

- docs/architecture/staff-invitation-azure-evidence-readiness-v1.md
- docs/architecture/staff-invitation-independent-evidence-architecture-v1.md
- docs/architecture/p0-a2b4-storage-authority-isolation.md

The invitation storage prototype is not an approved production
storage implementation.

Repository reference searches did not find direct runtime use of
the named prototype interfaces in the searched source paths.

That observation is not proof that all indirect or dynamic
integration possibilities are absent.

Prior synthetic contracts and tests do not establish live Azure
configuration, authoritative evidence provenance, or production
authorization.

## 3. Required resource scope

An authorized proposal must identify, through a separately
approved process:

- Azure tenant and subscription.
- Environment, including its production or staging classification.
- Intended resource group and storage account.
- Exact table or other applicable resource scope.
- Resource ownership and data classification.
- Whether the resource already exists or is merely proposed.
- Effective configuration authority and responsible administrator.

All specific resource names and IDs remain UNAPPROVED here.

A proposed identifier is not proof of resource existence,
ownership, authorization, or security compliance.

## 4. Required identity scope

An authorized proposal must identify:

- Intended application workload identity.
- Intended evidence collection identity.
- Independent reviewer identity or designated review role.
- Authentication and credential custody mechanism.
- Control-plane and data-plane permission boundaries.
- Inherited role assignments and alternate authority paths.
- Shared-key or connection-string bypass considerations.
- Whether data-plane access is actually required.

No inspection principal, workload principal, or permission
grant is approved by this document.

The evidence collector must not be assumed to share the
application's execution authority.

## 5. Six-control evidence plan

### C1 - Scoped storage identity

Status: UNVERIFIED

Required proposal:
- Independently bound workload and target resource.
- Evidence of intended isolation and alternative access paths.
- Source, issuer, collection permission, and observation time.

### C2 - Effective least privilege

Status: UNVERIFIED

Required proposal:
- Effective RBAC, including inherited and administrative authority.
- Shared-key and connection-string bypass assessment.
- Negative-access tests only under separate explicit approval.

### C3 - Encryption at rest

Status: UNVERIFIED

Required proposal:
- Resource-bound encryption settings.
- Applicable key custody and encryption scope.
- Independently verifiable configuration evidence.

### C4 - Diagnostic redaction

Status: UNVERIFIED

Required proposal:
- Logging, exception, telemetry, and diagnostic path inventory.
- Sensitive-field redaction acceptance criteria.
- Synthetic tests without real staff or visitor information.

### C5 - Retention enforcement

Status: UNVERIFIED

Required proposal:
- Approved retention and deletion requirements.
- Applicable lifecycle or application-level enforcement.
- Treatment of backups, exports, diagnostics, and exceptions.

### C6 - Access auditing

Status: UNVERIFIED

Required proposal:
- Relevant audit-event coverage and evidence source.
- Diagnostic destination and access safeguards.
- Audit retention, availability, and independent review.

No control changes from UNVERIFIED until independent,
resource-bound evidence is collected and reviewed under
separate authorization.

## 6. Proposed evidence collection request

Every future inspection request must specify:

1. Requesting owner and accountable approving authority.
2. Exact tenant, subscription, environment, and resource scope.
3. Target identity and approved inspection identity.
4. Exact read-only commands or API operations proposed.
5. Permissions required and why lesser access is insufficient.
6. Evidence fields to collect and fields to suppress.
7. Trusted evidence issuer and independent observation time.
8. Resource binding and acceptable evidence freshness.
9. Audit destination and controlled retention period.
10. Independent reviewer and documented acceptance criteria.
11. Stop, rollback, and escalation procedures as applicable.
12. Explicit statement of prohibited operations.

These are mandatory request contents, not pre-approved values.

Do not include credentials, tokens, account keys, connection
strings, staff email addresses, or visitor records in the
approval request or its ordinary logs.

## 7. Proposed sequential approval gates

Gate A - Approve resource and environment inventory.

Gate B - Approve workload, collection identity, and effective
permission model, including credential bypass analysis.

Gate C - Approve evidence sources, redaction requirements,
trusted observation time, provenance, and freshness criteria.

Gate D - Approve the precise inspection operation list,
collection scope, audit destination, and authorized personnel.

Gate E - Independently review the completed evidence assessment
and document unresolved findings.

Gate F - Obtain separate change-control approval for any
remediation or production integration subsequently proposed.

Passing one gate never authorizes later gates.

Document approval alone does not pass Gates A through F.

## 8. Explicit prohibited activities

Without separate, specific authorization, do not:

- Query Azure resource or identity configuration.
- Enumerate Azure subscriptions or resource inventories.
- Read or modify Azure storage entities.
- Create or delete storage resources or tables.
- Assign, elevate, or remove RBAC roles.
- Read, export, rotate, or disclose secrets or keys.
- Access real invitation or personal records.
- Trigger Microsoft Graph invitations or activation.
- Enable feature flags, retries, or automatic recovery.
- Modify production workflows, infrastructure, or identities.
- Deploy or activate production invitation storage.

Ordinary repository documentation reviews are not live
Azure inspection approvals.

## 9. Stop conditions and evidence integrity

Stop the proposed inspection if:

- Scope, identity, permission, or approval cannot be confirmed.
- The request targets an unapproved environment or resource.
- Evidence provenance or the source issuer is untrusted.
- The observation time or freshness cannot be established.
- Evidence is incomplete, contradictory, or unexpectedly broad.
- The operation could reveal secrets or personal records.
- A proposed read-only operation requires mutation rights.
- Shared keys or other bypasses have not been evaluated.
- An unexpected production or Microsoft Graph action appears.

A missing approval is a stop condition, not an invitation
to use a broader available permission.

A reviewer must distinguish observed configuration from
claims supplied by an application or requester.

## 10. Roles and decision ownership

The following are proposed roles, not assignments:

- Resource owner: confirms resource and environment scope.
- Azure administrator: establishes configuration evidence.
- Security reviewer: assesses effective permissions and controls.
- Backend owner: inventories code and telemetry boundaries.
- Data-governance owner: approves data retention requirements.
- Independent approver: authorizes exact collection scope.

No individual, service principal, or Azure role is assigned
authority by this document.

## 11. Outstanding approval decisions

D1. Which exact resources and environments may be inspected?

D2. Which workloads and identities are in scope?

D3. Which control-plane and data-plane permissions are approved?

D4. Who independently authorizes and reviews collection?

D5. Which evidence sources and freshness criteria are trusted?

D6. What redaction, audit, and retention rules are required?

D7. What constitutes sufficient evidence for each control?

All seven decisions remain OPEN.

## 12. Final non-authorizing declaration

C1 Scoped storage identity: UNVERIFIED
C2 Least privilege: UNVERIFIED
C3 Encryption at rest: UNVERIFIED
C4 Diagnostic redaction: UNVERIFIED
C5 Retention enforcement: UNVERIFIED
C6 Access auditing: UNVERIFIED

The term UNVERIFIED does not establish that a control is
absent or disabled. It means adequate independent evidence
has not yet been obtained and assessed.

No live Azure evidence was collected for this milestone.

No Azure resource, inspection identity, permission set,
production storage integration, or deployment is approved.

Status: PROPOSED - NON-AUTHORIZING
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED
