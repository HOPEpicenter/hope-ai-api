# D6-B8: Staff Invitation Staging Decision and Evidence Matrix v1

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Baseline: dbfa9f1e249f7b51d287be4533271c0da30f1cc4
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED

## 1. Purpose and boundaries

This document organizes seven unresolved staging decisions
into a proposed review and authorization sequence.

It does not resolve, approve, or delegate any decision.
It does not authorize live inspection, resource creation,
permission changes, data access, deployment, or activation.

Repository configuration references are candidate evidence,
not independent verification of Azure resource state.

Production resources and production inspection are out of scope.

## 2. Source documents

- staff-invitation-azure-evidence-readiness-v1.md (D6-B5)
- staff-invitation-evidence-collection-approval-scope-v1.md (D6-B6)
- staff-invitation-staging-resource-approval-v1.md (D6-B7)

These sources establish planning boundaries, not live
Azure resource verification or operational permission.

## 3. Decision-status matrix

| Decision | Subject | Status | Proposed responsible role |
| --- | --- | --- | --- |
| S1 | Staging subscription and resource group | OPEN | Resource owner |
| S2 | Staging Function App boundary | OPEN | Resource owner and backend owner |
| S3 | Invitation storage account and table | OPEN | Storage owner and data-governance owner |
| S4 | Runtime identity and credential mechanism | OPEN | Backend owner and security administrator |
| S5 | Independent evidence-collection identity | OPEN | Security administrator and independent reviewer |
| S6 | Approval, retention and audit ownership | OPEN | Authorized governance and resource owners |
| S7 | Permitted evidence and acceptance criteria | OPEN | Independent reviewer and security administrator |

Role names are proposed responsibilities only.
No named person or identity receives authority here.

## 4. S1 - Staging subscription and resource group

Status: OPEN

Required evidence:
- Proposed environment, subscription, and resource-group
  identifiers supplied through an approved review channel.
- Resource ownership confirmation and staging-only boundary.
- Explicit determination that production is excluded.

Acceptance criteria:
- An authorized owner confirms the exact staging scope.
- An independent reviewer records the scope decision.
- No resource query occurs merely to discover candidates.

Stop conditions:
- Unknown owner, ambiguous scope, or production overlap.
- Untrusted identifier or missing written approval.

## 5. S2 - Staging Function App

Status: OPEN

Required evidence:
- Candidate Function App references from existing repository
  deployment documentation.
- Owner-confirmed binding to the approved S1 scope.
- Distinction between deployment principal and runtime principal.

Acceptance criteria:
- Authorized owner confirms the exact Function App boundary.
- Independent reviewer accepts the non-secret resource binding.

Stop conditions:
- Function App identity or environment cannot be established.
- Deployment authentication is mistaken for runtime access.

## 6. S3 - Invitation storage account and table

Status: OPEN

Required evidence:
- Owner decision on whether dedicated staging invitation
  storage is required or proposed.
- Proposed account and table architecture, if applicable.
- Data classification, retention, and isolation requirements.

Acceptance criteria:
- Authorized storage and governance owners approve the design.
- Explicit confirmation that no existing account or table
  is inferred from missing deployment-workflow references.

Stop conditions:
- Unapproved storage target or unknown data owner.
- Request to create, inspect, or access storage prematurely.

## 7. S4 - Runtime workload identity

Status: OPEN

Required evidence:
- Proposed runtime principal and credential mechanism.
- Required storage data-plane actions and resource scope.
- Account-key, connection-string, and alternate access-path
  threat assessment.
- Separation from staging deployment identity.

Acceptance criteria:
- Backend and security owners accept proposed least privilege.
- Independent reviewer records unresolved bypass risks.

Stop conditions:
- Unknown effective RBAC or credential custody.
- Deployment identity assumed to authorize runtime access.
- Any request to assign privileges without approval.

## 8. S5 - Independent evidence collector

Status: OPEN

Required evidence:
- Proposed independent collector principal and owner.
- Allowed read-only operations and narrow resource scope.
- Evidence provenance, redaction, and audit requirements.
- Explicit distinction from deployment and runtime identities.

Acceptance criteria:
- Authorized security owner approves proposed collector scope.
- Independent reviewer confirms segregation of duties.
- No data-plane record reading is silently included.

Stop conditions:
- Collector permissions exceed proposed inspection.
- Collector identity is not independently attributable.
- Collection would expose secrets or personal information.

## 9. S6 - Approval and governance owners

Status: OPEN

Required evidence:
- Authorized resource and security decision makers.
- Independent reviewer and documented approval procedure.
- Data-governance, retention, deletion, and audit owners.
- Evidence storage and retention responsibility.

Acceptance criteria:
- Each accountable role is assigned by an authorized process.
- Approval records identify the decision and its exact scope.
- Approval separation is documented and independently checked.

Stop conditions:
- Self-approval where independent review is required.
- Missing accountable owner or unresolved retention decision.
- Treating a merged proposal as operational authorization.

## 10. S7 - Evidence outputs and acceptance criteria

Status: OPEN

Required evidence:
- Proposed read-only operations for each security control.
- Exact allowed non-secret output fields and redaction rules.
- Trusted issuer, timestamp, resource binding, and freshness.
- Independent validation and evidence retention requirements.

Acceptance criteria:
- Reviewer approves precisely scoped collection instructions.
- Control-specific acceptance and failure criteria are explicit.
- Collection is separately authorized after S1-S6 decisions.

Stop conditions:
- Unapproved API calls, output fields, or resource discovery.
- Secrets, personal records, or production resources involved.
- Unknown evidence provenance or stale evidence.

## 11. Proposed dependency order

Stage 1 - Establish resource ownership and scope (S1, S2).
Stage 2 - Decide storage design and runtime access (S3, S4).
Stage 3 - Define independent collector and governance (S5, S6).
Stage 4 - Approve evidence operations and criteria (S7).

This is a proposal for decision sequencing.
It is not a finding that any stage has been approved.

A later, separate authorization is required before any
live staging Azure inspection or evidence collection.

## 12. Security-control traceability

C1 Scoped storage identity: UNVERIFIED.
Proposed dependencies: S1, S3, S4, S5, S7.

C2 Least privilege and credential bypass: UNVERIFIED.
Proposed dependencies: S1, S3, S4, S5, S7.

C3 Storage encryption at rest: UNVERIFIED.
Proposed dependencies: S1, S3, S5, S7.

C4 Diagnostic redaction: UNVERIFIED.
Proposed dependencies: S2, S3, S4, S6, S7.

C5 Retention enforcement: UNVERIFIED.
Proposed dependencies: S3, S6, S7.

C6 Access auditing: UNVERIFIED.
Proposed dependencies: S1, S3, S5, S6, S7.

These dependencies do not independently verify controls.

## 13. Authorization prohibition

Until a separate, recorded authorization exists:

- Do not query live Azure resources or identities.
- Do not inspect role assignments or application settings.
- Do not retrieve tokens, keys, secrets, or connection strings.
- Do not read or modify invitation storage records.
- Do not create storage accounts, tables, or resources.
- Do not assign roles, identities, or permissions.
- Do not execute Microsoft Graph invitation operations.
- Do not activate feature flags or runtime integration.
- Do not deploy manually or activate production behavior.
- Do not inspect or alter production resources.

No approval may be inferred from GitHub CI success,
staging deployment success, or a documentation merge.

## 14. Review and next milestone

All seven staging decisions remain OPEN.
All six Azure storage security controls remain UNVERIFIED.

Future work may prepare decision-specific approval records,
but must not silently resolve S1-S7 or authorize operations.

Independent review is required for any proposed change to
this document before merging it into protected main.

Status: PROPOSED - NON-AUTHORIZING
Scope: STAGING ONLY
Azure inspection authorization: NOT GRANTED
Production approval: NOT GRANTED
Evidence collection: NOT PERFORMED
