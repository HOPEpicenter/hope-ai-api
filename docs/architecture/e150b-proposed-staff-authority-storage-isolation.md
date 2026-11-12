# E150B — Proposed Isolated Staff Authority Storage Boundary

Status: **TARGET ARCHITECTURE OWNER-APPROVED / DESIGN-ONLY / NON-AUTHORIZING**  
Evidence date: 2026-11-12  
Source baseline: protected backend main `ebfeba902236be8c6594e7000ffe3cda346a571a`  
Owner decision (2026-11-12): **Separate authority storage account and dedicated writer identity APPROVED AS TARGET DESIGN ONLY. Azure resource changes and migration NOT AUTHORIZED.**

## 1. Purpose

Turn E150A1–E150A4 read-only Azure metadata observations and the already merged E148D/E149A–C research into an actionable, separately reviewable authority-storage isolation proposal. Do not turn on a Staff authority adapter, coordination mode, OAuth claims, Graph invitations, or any migration.

## 2. Verified observations (scope-limited)

The accountable owner ran read-only Azure CLI inspection of the Microsoft Azure Sponsorship subscription and reported:

- Isolated Flex app: `hope-ai-api-staging-flex`; one user-assigned managed identity; no system-assigned identity.
- Isolated Phase C storage: `hopec6flexstg01`; public network access Disabled, shared-key access False, network-rule default Deny.
- This Flex identity receives `Storage Blob Data Owner` and `Storage Table Data Contributor` at the **storage-account scope**, not a specific table scope.
- Five storage-applicable role assignments were listed (including inherited): one Owner (subscription User); one Contributor (resource-group ServicePrincipal); one User Access Administrator (scope classified OTHER_SCOPE, User); and the two Flex data roles above. Their effective operational capabilities were **not** individually proved.
- Of two *other Microsoft.Web/sites* inspected in this subscription, zero were observed referencing the Flex user-assigned identity.

These observations do **not** identify every service principal, maintenance identity, old deployment, cross-subscription assignment, privileged credential path, or actual Table data-plane access. They do not prove authorization isolation. The Flex app's `AzureWebJobsStorage` host-storage resource and the application `HOPE_TABLE_ENDPOINT` must not be assumed identical without metadata-only binding verification.

The backend `StaffEventsRepository` writes canonical `StaffEvents` via a Table client and `createEntity`. The runtime transition mode defaults to legacy compatibility. A flag or app-side guard cannot block independently deployed older code or a direct writer sharing broad data access.

## 3. Security decision — preferred candidate, not deployed approval

**Prefer a distinct authority-storage account with a dedicated narrowly authorized writer identity**, retaining canonical StaffEvents as historical/audit projection at its existing storage destination. The ordinary Flex/canonical StaffEvents identity must have **no data-plane or privileged credential route** to modify the authority store.

A separate Azure account is a useful isolation boundary but **not automatically sufficient**: subscription/resource-group Owner or Contributor roles, role-assignment administrators, shared credentials, role assignments inherited at broad scope, and application deployment identity choices can defeat separation. Minimize blast radius; compare resource-group/subscription scoping and budget/network complexity before final approval.

The future authority store must enforce normalized global Entra binding ownership, monotonic security revisions/generations, replay-safe receipts, and revocation ordering at a real commit boundary. A shared partition is one candidate; Azure Table batch limits, contention, identity separation, and recovery constraints require independent validation. No topology or schema is selected by this document.

## 4. Required identities and effective-access proof

| Actor / boundary | Proposed capability | Forbidden capability |
| --- | --- | --- |
| Dedicated authority writer | Conditional updates to designated authority records only, with separately controlled credentials | Canonical compatibility mutation unless explicitly justified |
| Existing isolated Flex app / canonical StaffEvents writer | Existing pilot compatibility behavior | Any authority-table/account write |
| Authorization reader | Narrow read of independently trusted authority after separate approval | Role/owner inference from untrusted StaffEvents projection |
| Legacy deployments / direct callers | No authority access | Security state, binding, revision or receipt mutation |
| External invitation / OAuth executor | Independently fenced execution after separate approval | Grant based on a synthetic verdict or receipt alone |
| Operators / CI identities | Audited least-privilege administration with break-glass controls | Untracked privileged bypass of authority boundary |

Do not treat nominal identity names or inherited RBAC listings as an effective-access proof. Verify actual accessible scopes, role definitions and data actions, and alternative key/SAS/connection-string channels without fetching or outputting secret values. Check any account-level keys are disabled and that no broad permission paths restore authority writes to old code.

## 5. Minimal decision sequence

1. **Metadata-only endpoint mapping**: determine, without displaying secret values, whether the isolated Flex deployment's configured `HOPE_TABLE_ENDPOINT` points to `hopec6flexstg01` or a different application data account; record only a yes/no or classified account identifier result. Never call `az functionapp config appsettings list` or a secret-returning API as part of this step.
2. **Topology decision**: compare distinct authority account vs alternate enforceable boundary for access control, private endpoints/DNS, failover, atomicity, cost and operational burden; seek explicit owner approval before provisioning.
3. **Permission gate**: verify effective principal/role reachability, including inherited and privileged paths, then prove independent denial of an attempted legacy authority write in a disposable isolated environment. Do not infer safety from an app-level deny flag or mock.
4. **Protocol gate**: SDK/Azurite and then approved isolated storage proof for conflicting owner claims, revision/generation races, replay/ambiguous acknowledgment, rollback and projection obligations, with security-sensitive readers failing closed.
5. **Integration gate**: stage new coordinated writers/readers only after the permission and protocol gates are proved; retain existing historical StaffEvents and ministry/care/formation compatibility. Prove invocation of Graph and OAuth remains externally fenced.
6. **Pilot gate**: independently review acceptance evidence and obtain a separate decision for any controlled deployment or feature activation.

## 6. Remaining blockers and explicit nonclaims

- Not yet verified: the actual application Table endpoint and credential routing for StaffEvents.
- Not yet verified: all deployed Staff writers, non-Web principals, privileged authority writers or effective permissions.
- Not yet selected: authoritative account, partition topology, schema, dedicated writer workload, deployment privileges or cost.
- Not yet proved: storage-level non-bypass, real global binding uniqueness, durable projection audit/reconciliation, rollback, or external executor fences.
- E149A–C are synthetic **non-authorizing** models. All runtime and production-rollout permissions remain disabled.

## 7. Safety fence

**This PR changes documentation only.** Do not create Azure resources, change RBAC, inspect secret values, open the acceptance VM, use live Staff data, deploy either environment, alter original staging/production, send Graph invitations, enable OAuth execution, contact visitors, or rewrite StaffEvents. Preserve the existing protected-main merge/independent-review workflow and secure pilot readiness priority.

## 8. E150D accountable-owner architecture decision (2026-11-12)

The accountable owner explicitly approved **a separate Staff authority storage account and a dedicated writer identity as the target architecture**, with **no authorization yet to create or modify Azure resources**. This selects the intended isolation direction and does not approve a precise Azure account name, resource group, private endpoint/DNS configuration, RBAC assignment, schema, partition key, deployment identity, app setting, migration, or cost.

The E150C2 read-only human verification additionally established: the isolated Flex app uses `HOPE_TABLE_AUTH_MODE=managed-identity`, and its configured `HOPE_TABLE_ENDPOINT` matches the Phase C storage account `hopec6flexstg01`. **No setting value or credential was copied into the repository.** This means the existing app's account-scoped Table Data Contributor role presently covers its configured application Table storage boundary, further supporting the decision to isolate future authority writes in another permission boundary.

### First implementation gate, before any Azure mutation

1. Define the new authority writer's **independent workload and effective data-plane permission boundary**; prove no old Flex, legacy deployment, or broadly privileged application credential can mutate the new authority state. A different account alone is not proof of this.
2. Produce a narrowly scoped non-executing configuration/permission contract and regression tests **only if needed** to enforce default-deny behavior; no code path should grant live authority from synthetic E149 models.
3. Independently review exact provisioning scope, network topology, storage operation costs, RBAC inheritance, shared-key restrictions, isolation/rollback proof plan, and the cancellation/revocation model. Seek a **separate explicit owner authorization** before provisioning or changing any role assignment.
4. Continue to preserve canonical StaffEvents history and existing six-week Staff follow-up behavior. No production/original-staging changes or live Staff contact are part of E150D.

### Prohibited interpretation

**Architecture approval is not deployment approval, storage-access approval, migration approval, invitation authorization, OAuth authorization, or permission to activate the authority adapter.** All runtime, retry, reconciliation-repair, and rollout gates remain disabled pending subsequent independently reviewed proofs.
