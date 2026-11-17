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

## 13. Gate A revision - independent reviewer findings (2026-11-17)

Independent reviewer Hope-2018 approved the existing **non-authorizing
code foundation**, but explicitly recorded **CHANGES REQUIRED / OPEN
QUESTIONS REMAIN** for the proposed infrastructure architecture.
The GitHub review state of APPROVED must not be interpreted as an
architecture, provisioning, or Staff bootstrap approval.

The following are concrete **candidate decisions for a second review**,
not claims about deployed resources or verified effective isolation.

### 13.1 Authority resource-group boundary and administrative privileges

**Proposed decision:** place the authority storage account, its dedicated
writer identity, and writer workload in a *new, dedicated authority
resource group* in the existing approved subscription, rather than the
current kiosk operational resource group. Candidate logical name:
`rg-hope-kiosk-staff-authority` (not created, availability not verified).
Keep private endpoint and DNS connection points in the existing kiosk VNet
unless the connectivity review identifies an unavoidable reason otherwise.

**Required independent proof before provisioning:**
- Enumerate direct and inherited Azure role assignments at the new
  resource-group's parent subscription scope, including Owner,
  Contributor, User Access Administrator, Role Based Access Control
  Administrator, groups, PIM/eligible assignments, and CI/deployment
  identities where observable.
- Explicitly distinguish management-plane privilege (which can change
  identities, assignments, deployment code or account configuration) from
  Table data-plane roles. A new resource group does **not** defeat
  inherited subscription privileges.
- Classify all pathways for existing kiosk, legacy, original staging,
  deployment, and recovery identities to obtain authority data access.
  Do not display tokens, account keys or connection-string values.
- Require a preapproved break-glass administrator, access-change logging,
  least-privilege identity assignment, and a separate operational change
  approval. Do not claim absolute isolation from subscription owners.
- Verify shared-key access disabled, and demonstrate real Azure
  unauthorized principal denial against disposable synthetic authority
  data after separately authorized provisioning.

**Stop condition:** any existing kiosk runtime identity, legacy runtime
or broadly shared application credential retains a usable authority
Table mutation path.

### 13.2 Dedicated writer workload selection

**Preferred candidate:** a separately deployed, **manual-trigger-only
Azure Container Apps Job**, assigned only the dedicated user-managed
writer identity, inside an independently verified private-network-capable
Container Apps environment. A *new* workload is proposed; the existing
kiosk API must not be repurposed as the authority writer.

Before selection, verify that the existing Microsoft.App environment,
`snet-kiosk-flex` delegation, its networking/egress, identity binding,
Container Apps Job manual start controls, and storage private DNS route
actually support the deployment. If not, evaluate a separate environment
or alternative isolated job hosting without silently expanding scope.

**Deployment posture:** no schedule, no event trigger, zero unattended
bootstrap executions, no credentials or runtime values in repository,
no exposed HTTP administrative endpoint, explicit operator authorization
per operation, immutable artifact digest and trusted deployment identity.
The identity allowed to deploy/start a job must be reviewed separately
from the writer's Table-data identity. A disabled configuration or CLI
flag is not a replacement for permission-level isolation.

**Unresolved:** actual Container Apps environment inventory and
network support, job/start RBAC, dedicated compute costs, identity
assignment authority, region support, and the specific artifact to run.
Do not create a job or modify an environment as part of this revision.

### 13.3 Proposed exact permission-intent matrix

| Principal | Authority Table data | Other data stores | Management-plane intent |
| --- | --- | --- | --- |
| Dedicated writer managed identity | Proposed `Storage Table Data Contributor` **at the authority Table resource scope**, only if Azure accepts that scope and the SDK operations require no broader privilege | No canonical StaffEvents write permission by default | No resource creation, role assignment, or identity assignment privileges |
| Existing kiosk API managed identity | No assignment; independently prove no inherited/alternate authority data-plane access | Retain existing operational storage roles | No new authority account management privileges |
| Existing legacy/original staging identities | No assignment; deny verification required | Existing access unchanged | No new authority resource management privileges |
| Dedicated authorization reader (future decision) | Proposed `Storage Table Data Reader` on authority Table only | None required for authoritative reads | None |
| CI/deployment identity (future decision) | No authority data-plane permission by default | None required for authority records | Only explicitly approved resource deployment/identity attachment actions; no unconstrained Owner/Contributor assumption |
| Designated human break-glass operator | No standing data-plane grant by default | None by default | Time-bound, audited elevation with independent approval, where supported |

This is a *permission contract*, not a statement that Azure RBAC
assignments exist or that Table-level scoping is validated. Resolve
actual Table resource IDs, supported assignable scopes, inherited Data
Actions, and control-plane privilege bypasses before owner authorization.
Do not grant the existing kiosk identity Table Contributor on the new
authority storage account for convenience.

### 13.4 Network, monitoring and evidence requirements

**Network:** proposed one Table private endpoint for the new account in
`snet-kiosk-private-endpoints`, with the existing
`privatelink.table.core.windows.net` zone reused only after read-only
link and routing checks. The observed five endpoint configurations are
not proof of remaining IP capacity. Confirm source job routing,
name resolution, outbound policy, effective NSG/UDR coverage, private
endpoint approval, and no unintended public fallback.

**Monitoring proposal:** capture management-plane Activity Log events
(resource, identity, role and network changes), authority Table
operation failures/conflicts, job start/stop outcomes, and correlation
IDs with immutable operation receipt IDs. Send operational alerts for:
- unexpected writer start or unauthorized principal access attempt;
- binding conflict, ETag/precondition failure spikes, or replay attempts;
- missing projection obligation, reconciliation-required or unknown
  acknowledgment state;
- writer identity or RBAC modification, private endpoint/DNS changes;
- missing logging/diagnostic evidence and repeated job failure.

Decide diagnostic destination, retention, access restrictions, alert
ownership, incident response contact, storage/telemetry costs, and
sensitive-data redaction **before** infrastructure authorization.
Do not log visitor PII, staff tokens, secret values or raw Entra IDs.
Azure telemetry availability and exact log categories require validation;
the list above is a proposed detection contract, not deployed monitoring.

### 13.5 Rollback, recovery and operational freeze

**Pre-execution acceptance:** verify authority state is empty or
explicitly reconcile previously observed synthetic receipts; snapshot
approved configuration **without secrets**; verify independent deny
tests and deterministic operation IDs before any live bootstrap.

**Immediate containment:** disable all authority job starts and external
executor permissions, retain authoritative data and immutable receipts,
and alert the owner. Disabling jobs alone is insufficient if Table
permissions remain; emergency response must include separately
authorized revocation of writer data-plane permissions or identity
assignment where appropriate.

**Recovery:** when the authority commit is ambiguous, perform
read-only receipt/ownership/generation inspection first; classify
committed, not committed, conflicting, and unknown. No blind retry,
projection repair, role restoration, Graph action or OAuth authorization.
Cross-account/canonical StaffEvents projections remain asynchronous and
non-atomic. Missing/contradictory evidence fails closed.

**Rollback:** roll back code/configuration only by a separately approved
change; never delete or regress authority head, immutable receipts,
revocations or security generations. Disabling an authority reader must
not silently restore grants from historical StaffEvents projections.
Restore service only after independent review and an explicit owner
decision. Historical audit and six-week follow-up data stay intact.

**Cost and lifecycle:** obtain a current Azure estimate for account
capacity/transactions, private endpoint, private DNS, job compute,
diagnostics/logging, alert rules and any new Container Apps environment.
Specify spending ceiling, owner and decommission plan for temporary
acceptance resources prior to provisioning.

### 13.6 Exact gate disposition

| Gate A finding | Proposed resolution | Evidence still required |
| --- | --- | --- |
| RBAC isolation | Dedicated account/group, role-intent matrix, no kiosk writer access | Inherited/effective access inventory and actual Azure denied writes |
| Resource group | Dedicated authority group candidate | Parent-scope privilege review and final owner decision |
| Workload hosting | Manual-only isolated Container Apps Job candidate | Existing environment suitability, costs, deploy/start permission proof |
| Role scope | Table-scoped writer/reader roles proposed | Validate real resource scope, built-in Data Actions and privilege pathways |
| Monitoring | Audit/alert contracts defined above | Diagnostic feasibility, destination, retention, operator and price |
| Rollback | Fail-closed containment and evidence-first recovery specified | Practiced synthetic incident/rollback proof |

**Current outcome: DESIGN REVISION FOR INDEPENDENT RE-REVIEW;
NOT AN INFRASTRUCTURE AUTHORIZATION.** Do not provision, change RBAC,
merge protected main, deploy either staging or production, activate
Staff Authority, or create the first Staff administrator.

## 14. Lead engineering decision and non-executing deployment contract

**Decision owner:** HOPE Ministry OS lead engineering. **Independent reviewer:**
Hope-2018 checks the resulting proposal and implementation; the reviewer
does not select the engineering architecture. **Accountable owner:** must
separately approve costs, privileged Azure changes, deployment and any
Staff bootstrap. This section makes the technical choices explicit.

### 14.1 Selected implementation architecture

- **Separate resource group:** `rg-hope-kiosk-staff-authority`
  (candidate name, not created) for authority storage, writer identity
  and isolated writer workload.
- **Authority storage:** `sthopekauth20261122` (candidate; naming and
  availability pending), StorageV2, Standard_LRS, East US 2, private
  Table endpoint, shared keys/public access disabled.
- **Table:** `StaffAuthority`; authority head, normalized kiosk Entra
  binding, generation, immutable receipt and projection obligation
  must be designed to share an appropriate atomic partition.
- **Compute:** an Azure Container Apps Job configured with Manual
  trigger, one replica/completion, parallelism one, and
  `replicaRetryLimit: 0`; no schedule/event trigger or public HTTP
  endpoint. Select a separately deployed writer artifact with pinned
  immutable digest and minimal identity. Existing kiosk API is not a
  permitted authority writer.
- **Runtime identity:** only
  `id-hope-kiosk-authority-writer` (candidate name) is bound to the
  authority-writing job. No connection strings, account keys or
  existing kiosk API identity are accepted as authority credentials.
- **Private networking:** existing VNet, `snet-kiosk-private-endpoints`,
  and Table DNS zone are preferred, but the Container Apps managed
  environment's VNet routing and DNS connectivity are a *go/no-go
  feasibility dependency*. Do not attach an unverified environment
  or infer reachability from VNet existence alone.

A *manual trigger is not an authorization boundary by itself*. Azure
Container Apps job start permissions may allow an execution-template
override (including image/command/environment), which effectively
grants use of the job's managed identity. Thus:
- Do **not** assign `Container Apps Jobs Operator` or `Container Apps
  Jobs Contributor` to ordinary staff, dashboard principals, kiosk
  API, general CI, or broad shared automation identities.
- `Microsoft.App/jobs/start/action` is reserved for a reviewed,
  separate trusted operations principal subject to explicit owner
  approval; even a narrowly scoped custom job-start role must be
  treated as a high-trust delegation. Job image and identity changes
  also require explicit reviewed deployment authority.
- No standing job-start grants are part of initial provisioning
  unless the privilege owner and break-glass controls are approved.

Reference basis (Microsoft Learn, checked 2026-11-17):
- https://learn.microsoft.com/en-us/azure/container-apps/jobs
- https://learn.microsoft.com/en-us/azure/container-apps/jobs-get-started-cli
- https://learn.microsoft.com/en-us/azure/storage/tables/assign-azure-role-data-access
- https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage

### 14.2 Exact proposed RBAC scope and limits

The future writer data-role assignment target is the **table** resource,
not the account:
`/subscriptions/<approved-subscription-id>/resourceGroups/rg-hope-kiosk-staff-authority/providers/Microsoft.Storage/storageAccounts/sthopekauth20261122/tableServices/default/tables/StaffAuthority`.

- Writer identity -> `Storage Table Data Contributor` at that scope,
  subject to creating the Table through an independently controlled
  provisioning identity and proving all SDK operations work without
  account-scope elevation.
- Future read service -> `Storage Table Data Reader` at the same
  table scope, only if/when a separate reader is approved.
- Existing kiosk API and original staging identities -> **no** new
  role assignment at the authority account, Table or parent scope.
- CI/build identity -> no authority data access and no job-start
  permission; infrastructure deployment roles to be separately
  enumerated and minimized.
- Break-glass/owner -> time-bound auditable privilege; do not assume
  a separate group blocks inherited subscription privileges.

Contributor on the Table includes write **and delete** capabilities;
it cannot enforce append-only receipts through RBAC. Protocol
immutability must be protected by ETags, receipts/reconciliation,
audit detection, and writer code restrictions; tamper resistance
against compromise of the dedicated writer is a residual risk for
independent review. No claim of cryptographic immutability is made.

### 14.3 Pre-provisioning feasibility gate (read-only)

Collect only classified metadata, without secrets:
1. Existing Container Apps managed environment: resource-group,
   region, workload profile, VNet/subnet attachment, private DNS
   routing and ability to host a job from the proposed separate RG.
2. Confirm Container Apps Job support in the selected region and
   required managed identity and VNet environment.
3. Confirm Azure Table resource-scope RBAC is valid for the planned
   writer/read operations, and inventory actual inherited and
   privileged assignments on all applicable scopes.
4. Confirm private endpoint subnet IP availability and DNS zone links,
   without altering existing network configuration.
5. Confirm authority account name availability, resource group and
   subscription approval, estimate monthly fixed/variable costs,
   determine logging destination and alert/retention owner.
6. Confirm container registry pull credentials and digest pinning;
   verify that the deployment identity does not silently acquire
   Table writer or job-start permissions.
7. Validate independent staging deployment guard before any
   protected-main merge. The existing `deploy-staging.yml` executes
   upon non-ignored `main` pushes, including kiosk files.

Unknown/missing/failed checks block Gate B; they do not authorize
fallback to public endpoints, broad roles, or alternate resources.

### 14.4 Provisioning execution plan - intentionally disabled

The eventual ordered change plan, **only after separate owner approval**:
1. Provision dedicated authority resource group with appropriate
   inherited-RBAC review, governance and tags.
2. Provision secured authority storage account, Table and logging
   destination, default private/keys-off posture.
3. Provision private Table endpoint, DNS zone group/link if needed;
   independently verify private resolution from the chosen workload.
4. Provision writer user-assigned identity; bind only the validated
   Table-scoped role and confirm the old kiosk identity has no
   authority path.
5. Provision a manual-only Container Apps Job with zero automatic
   retries, verified immutable image, and no authorized live
   operation/start grants at creation.
6. Verify isolation with **approved synthetic test data**:
   old writer direct Table mutation denied at Azure data plane,
   dedicated writer allowed only as specified, conditional
   transactions and ambiguous response behavior fail closed.
7. Configure audit/alert rules and confirm incident stop/rollback.
8. Seek a distinct decision for any writer execution, canonical
   projection integration, OAuth permission or real Staff bootstrap.

No ARM/Bicep `what-if`, `az deployment create`, `az role assignment
create`, `az containerapp job create/start`, storage creation or
other mutation command is executed by this documentation update.
The exact deployment artifact is **not yet implemented**. It must be
reviewed, disabled by default, and tested before any approved use.

**Explicit engineering hold:** Gate B infrastructure provisioning,
job execution, Staff Authority activation, canonical Staff mutation,
Graph invitation, OAuth execution, original staging and production
deployment remain prohibited. PR #1507 stays draft.

## 15. Verified authority network decision - 2026-11-17

Status: ENGINEERING DESIGN SELECTED / NOT PROVISIONED.

### 15.1 Dedicated environment and subnet

Selected candidate:
- VNet: vnet-hope-kiosk-acceptance
- Region: eastus2
- Subnet: snet-kiosk-staff-authority
- CIDR: 10.88.0.160/27
- Delegation: Microsoft.App/environments
- Environment: new workload-profiles Container Apps environment
- Job: manual-only authority writer, zero automatic retries
- No public administrative HTTP endpoint

K358GO verified the existing subnet address allocations.
The proposed /27 does not overlap the reported existing
subnets. Preserve all existing subnet delegations.

The new subnet and environment are not provisioned.
A workload-profiles environment is required for the
selected /27 topology; do not substitute the legacy
consumption-only environment.

### 15.2 Regional capability evidence

K358GM:
No Microsoft.App managed environments were found in
the approved subscription at the inspection checkpoint.

K358GP:
- managedEnvironments supported in East US 2: True
- jobs supported in East US 2: True
- Microsoft.App provider registration: Registered

These observations confirm regional resource-provider
availability, not completed deployment feasibility.

### 15.3 Private Table DNS evidence

K358GQ:
- Three private Table DNS zones identified in the subscription.
- The kiosk-associated zone has a successful VNet link.
- Link provisioning state: Succeeded.

Decision:
Reuse the existing kiosk Table private DNS zone linkage.
The new authority storage account still requires its own
private Table endpoint and appropriate DNS zone group.

Do not create duplicate DNS zones or additional VNet links
unless a specific verified dependency requires them.

### 15.4 Remaining Gate A blockers

Before requesting owner provisioning authorization:

1. Confirm available private endpoint subnet capacity.
2. Validate planned job-to-private-Table routing, DNS and
   applicable network security controls.
3. Confirm table-scoped writer RBAC, effective inherited
   privileges and exclusion of legacy write pathways.
4. Validate container artifact provenance, registry access,
   identity attachment and restricted job-start privileges.
5. Establish monitoring destination, retention, operator,
   alerts and an explicit monthly spending ceiling.
6. Complete the minimum-change resource provisioning plan,
   including failure containment and decommission controls.
7. Resolve protected-main staging deployment consequences.

No infrastructure provisioning, RBAC modification, job
execution, deployment, authority activation, Staff creation
or Graph invitation is authorized by this section.

Gate A remains pending final evidence and independent
security review. Gate B requires separate owner approval.

## 16. Authority monitoring decision - 2026-11-17

Status: PROPOSED / NOT PROVISIONED.

K359A verified three existing Log Analytics workspaces,
all in eastus, with 30-day retention and PerGB2018 SKU.

Selected architecture:
- Dedicated proposed workspace: law-hope-kiosk-authority
- Resource group: rg-hope-kiosk-staff-authority
- Region: eastus2
- SKU: Pay-as-you-go
- Initial retention target: 30 days
- Container Apps job and environment execution logs
- Storage Table read/write/delete diagnostic logs
- Azure management-plane activity and RBAC change monitoring
- Restricted audit access and sensitive-data redaction
- Alert ownership and incident response required

The workspace and all diagnostic settings remain
unprovisioned. Workspace naming and regional availability
must be confirmed before approval.

Cost gates:
- Verify current East US 2 ingestion and retention pricing.
- Include private endpoints, storage transactions, job
  execution, environment charges, alert rules and logging.
- Establish an explicit monthly spending ceiling.
- Identify the accountable monitoring and incident owner.
- Validate any shared-secret requirements for configuring
  Container Apps logging and protect those credentials.

Thirty-day retention is an initial cost-planning target,
not a finalized evidence-retention policy.

This decision does not authorize resource creation,
diagnostic configuration, RBAC changes, deployments,
job execution or Staff Authority activation.

## 17. Infrastructure pricing evidence - 2026-11-17

Status: RETAIL PRICING EVIDENCE / NO SPENDING APPROVAL.

All prices below are public USD retail meter observations.
Azure Sponsorship billing adjustments are not assumed.

### 17.1 Observed pricing

K359C - Azure Container Apps, East US 2:
- Standard active vCPU: USD 0.000024/second
- Standard active memory: USD 0.000003/GiB-second
- Environment Management Hour: USD 0.10/hour
- Environment Private Endpoint: USD 0.10/hour

Environment management meter applicability remains unresolved.
No Container Apps environment private endpoint is proposed.

K359F - Standard Azure Private Link:
- Global standard endpoint: USD 0.01/hour
- 730-hour endpoint planning amount: USD 7.30
- Data processing billed separately, subject to tiers.

K359H-A - Log Analytics, East US 2:
- Analytics Logs ingestion paid meter: USD 2.76/GB
- A zero-price ingestion meter also exists; eligibility unverified.
- Analytics Logs retention meter: USD 0.12/GB-month
- Billable retention eligibility and included periods require review.

K359I - Azure Tables, East US 2:
- Account Encrypted LRS data: USD 0.045/GB-month
- Account Encrypted LRS reads: USD 0.005/10K
- Account Encrypted LRS writes: USD 0.025/10K
- Account Encrypted LRS batch writes: USD 0.075/10K
- Account Encrypted LRS lists/scans: USD 0.09/10K

These Account Encrypted LRS prices must not be
substituted for unverified Standard LRS meter pricing.

### 17.2 Budget and security decision gates

Before owner approval:
1. Confirm which Container Apps environment management
   charges apply to the exact workload-profiles configuration.
2. Confirm Standard_LRS authority Table billing categories.
3. Estimate logging ingestion, storage volume, transactions,
   alert execution and job runtime using explicit assumptions.
4. Identify diagnostic ingestion and retention charges,
   private endpoint data transfer and any other fixed costs.
5. Obtain an Azure Sponsorship-aware spending estimate.
6. Set an explicit monthly budget ceiling and alert thresholds.
7. Verify effective inherited access, custom roles, privileged
   eligibility and permission-level legacy writer exclusion.
8. Approve monitoring access, incident ownership, job-start
   restrictions and fail-closed recovery procedures.
9. Resolve staging deployment consequences before main merge.

No amount in this section constitutes an approved budget.
Unresolved charges must not be assumed to be zero.

Gate A: pending final cost and effective-isolation evidence.
Gate B infrastructure authorization: NOT GRANTED.
Staff Authority activation: NOT AUTHORIZED.


## 18. Conditional monthly cost scenarios - 2026-11-17

Status: PLANNING MODEL / NOT AN APPROVED BUDGET.

Assumptions:
- One standard private endpoint, 730 hours.
- Paid Analytics Logs ingestion: USD 2.76/GB.
- One GB of Account Encrypted LRS Table data used
  only as a provisional pricing proxy.
- Example job: 1 vCPU, 2 GiB, 600 seconds per run.
- Compute uses active vCPU/memory retail rates.
- No assumed Azure Sponsorship discounts.

### 18.1 Light usage

- Private endpoint: USD 7.2999999999999998223643160600
- Analytics Logs: 1 GB
- Authority Table data: 1 GB
- Job executions: 1
- Modeled subtotal excluding operations:
  USD 10.12

### 18.2 Pilot usage

- Private endpoint: USD 7.2999999999999998223643160600
- Analytics Logs: 5 GB
- Authority Table data: 1 GB
- Table operations: 10K reads, 10K writes,
  and 10K batch writes using provisional
  Account Encrypted LRS rates.
- Job executions: 10
- Modeled subtotal:
  USD 21.43

### 18.3 Potential environment fee

If the environment management meter applies continuously:
- Additional exposure: USD 73/month.
- Pilot subtotal plus that fee:
  USD 94.43.

This is conditional, not a confirmed charge.

### 18.4 Exclusions and approval controls

These figures exclude:
- Unverified Standard LRS Table price differences.
- Private Link data processing and transfers.
- Alert rules, monitoring queries and notifications.
- Additional diagnostic ingestion and retention.
- Registry, networking and other applicable charges.
- Taxes and Sponsorship-specific billing adjustments.

Before Gate B approval:
- Resolve billable Container Apps environment features.
- Confirm applicable Table billing classification.
- Select a final workload and telemetry allowance.
- Establish a monthly spending ceiling and alerts.
- Obtain accountable owner approval for costs and
  exact resource provisioning.

No amount here authorizes spending or deployment.
Staff Authority remains disabled.
