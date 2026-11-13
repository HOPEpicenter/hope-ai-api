# E156-D1 — Disabled diagnostic harness and future rollback plan

**Status:** design-only / synthetic local tests. **Not a live Azure probe.**

## Safeguard
The E156-D1 implementation is a pure function under `src/domain/staff/inspectE156D1SyntheticProbe.ts`. It has no Azure client, managed-identity token request, HTTP trigger, environment reads, or network call. It accepts only a disabled synthetic plan and passes caller-supplied status-only evidence to the already merged E156 classifier. Even candidate permission-denial evidence never authorizes execution, retries, deployment, storage access, or Staff authority.

No Azure deployment, network, DNS, role-assignment, Staff record or infrastructure changes are authorized by this PR. No live execution code exists. Future execution requires a separate PR and owner approval at **each** gate.

## Approved resource inventory (reference only — not an instruction to modify)

- Existing isolated Flex app: `hope-ai-api-staging-flex`, using the existing legacy user-assigned managed identity.
- Authority storage: `hopec6authstg01`; authority resource group: `rg-hope-staff-authority-staging`.
- Existing authority VNet: `vnet-hope-staff-authority-staging`; existing Phase C VNet: `vnet-hope-c6-staging`.
- Proposed-only temporary endpoint name: `pe-hope-e156-authority-table`, targeting `table` on the authority storage account in Phase C's existing private endpoint subnet.
- Existing authority Table private endpoint and private DNS configuration must be preserved. No peering or identity reassignment is proposed.

## Future execution approvals (not granted)

1. **Separate code/deployment review:** approve a minimal, disabled-by-default live diagnostic implementation and prove it cannot be triggered by a public route, background timer or normal workload. Confirm the exact isolation strategy, prior package SHA, functions list and rollback method. This D1 module is *not* that implementation.
2. **Separate temporary network approval:** verify exact subscription, resource IDs and subnet compatibility, DNS record ownership, all existing `privatelink.table.core.windows.net` zone resource IDs and links, and a non-conflicting network plan. Record expected before/after DNS answers for **both** the current Phase C storage hostname and authority Table hostname. No automated zone-group write until it is demonstrated not to replace existing records.
3. **Separate deployment approval:** preserve existing isolated Flex application package and configuration fingerprints without obtaining secret values; use a tested rollback mechanism. Do not touch production or original staging. Do not enable authority actions or visitor contact.
4. **Separate data-plane approval:** make **at most one** authenticated, read-only Table request using the **actual existing Flex managed identity**, only after validating token identity without logging tokens/IDs and verifying HTTPS to the intended private Table endpoint. Never accept a network `403` as an RBAC denial. Emit only `identityMatched`, `privateRouteVerified`, `httpStatus`, and allowlisted `serviceErrorCode`. No response body, access token, principal ID, Staff identifier, URI, or record contents.
5. **Separate write-denial decision:** a read failure cannot prove mutation denial; any negative write test must be separately scoped to disposable synthetic data and separately authorized. No authority or StaffEvents records may be modified.

## Stop conditions

Stop, classify as inconclusive, and do not retry if identity mismatch, DNS ambiguity, routing or TLS failure, unexpected 2xx, 401/404, unidentified 403, unexpected Azure resource, loss of current application health, or loss of package rollback ability. The existing E156 synthetic classifier returns only non-authorizing evidence.

## Mandatory rollback and cleanup sequence (design only)

1. Stop the E156 diagnostic path before touching networking. Record a status-only disabled verification. Never leave a trigger enabled.
2. Restore the exact pre-test Flex application package only using the previously verified deployment/rollback method. Verify original Functions list, health and version, and unchanged Staff authorization gates.
3. Remove **only** the E156-tagged endpoint and any E156-owned DNS record or zone-group modifications, using exact resource IDs and conditional inventory matching. Avoid deleting pre-existing zones, zone links, other private endpoints, or unrelated DNS records.
4. Validate pre-test DNS answers and private HTTPS connectivity for `hopec6flexstg01`, confirm the existing authority private endpoint and VNet links still match the captured baseline, and verify authority storage remains private with Shared Key disabled.
5. Record: `DIAGNOSTIC_DISABLED`, `ORIGINAL_PACKAGE_RESTORED`, `TEMP_ENDPOINT_REMOVED`, `DNS_RESTORED`, `LEGACY_IDENTITY_UNCHANGED`, `RBAC_UNCHANGED`, `NO_STAFF_ACCESS`, `AUTHORITY_DISABLED`. Any unverified item blocks closure and requires explicit remediation.

**Cost / risk:** Additional private endpoint and DNS changes can affect existing storage resolution and incur temporary charges. The separate pre-change approval must explicitly accept those costs and address domain-wide DNS risks. Existing private endpoint isolation and legacy identity attachment are not to be weakened.

## Proven vs unproven
The CI-only harness tests malformed inputs, unwanted live enablement, non-executing classification and denial of credentials/response bodies. It **does not** establish live identity ownership, private routing, Microsoft Entra RBAC denial, other privileged access exclusion, or an enforceable writer protocol. No effective data-plane denial claim may be made from it.
