# Synthetic kiosk intake cleanup: preparation only

The accompanying simulator is restricted to branded in-memory fixtures. It
cannot read Azure or delete a live row. Its capture and approval objects are
synthetic test doubles, not evidence or authorization. No CLI flag enables
live access. A private managed-identity read adapter exists, but its public
entry point is unconditionally disabled and no trusted approval verifier exists.
The read-only `inspectSyntheticIntakeFixture` entry point also accepts only
branded in-memory fixtures, defaults to disabled, and returns status only.
Its `enabled` option and fixture capture are never live authorization.
The offline inspection authorization assessment is permanently denied: a
signature matching a supplied key does not establish a trusted issuer,
authenticated operator, UUID provenance, or durable replay protection.
The inspection consumption simulator uses an isolated in-memory claim and
audit record; even its successful fixture result grants no live authority.
It accepts no external transaction port and is neither durable nor a trusted
identity, key, or provenance verifier.

## Disabled private connectivity diagnostic

The private Table connectivity diagnostic has one exported entry point, which
always returns `AUTHORIZATION_UNAVAILABLE`. No application route, job, trigger,
startup hook, flag, caller input, or approval invokes its private checks. This
is not inspection or deletion authority and does not access a visitor table.

The disconnected runtime implementation pins the isolated Table hostname and
requires every resolved IPv4 address to match a separately supplied canonical
RFC1918 subnet. It connects to the selected IP on port 443 while verifying the
original hostname and TLS certificate. It obtains an Azure Storage token using
the configured user-assigned managed identity in a fresh, time-bounded worker,
with SDK retries and redirects disabled. The worker receives only the App Service
identity endpoint and header as its environment, isolating SDK managed-identity
state and excluding other credential sources; its output streams are not read
or forwarded. The private orchestrator returns statuses only, never the token.
The response deadline does not wait indefinitely for worker termination; the
worker is unreferenced during cleanup and cleanup errors use a fixed, non-sensitive
status message. A stalled or failed termination cannot guarantee the worker
actually stopped. This remains a blocker for any live enablement.

The optional service check sends one authenticated GET for
[`Get Table Service Properties`](https://learn.microsoft.com/en-us/rest/api/storageservices/get-table-service-properties)
at `/?restype=service&comp=properties`, not a table or entity path. Microsoft
documents this operation as returning account service properties, not visitor
data, and states that only the storage account owner may call it. The diagnostic
discards the response body and does not follow redirects. Whether this operation
accepts the isolated identity's bearer token and permissions remains unverified;
it must not be used as a reason to grant permissions.

A TLS-verified HTTP 401 or 403 is an HTTP response, not evidence that private
connectivity failed. Neither response proves effective Table data permissions.
Likewise, a 200 would establish access to this service-properties operation
only; it would not prove access to any visitor table or entity.

Before any separately authorized live test, independently verify the expected
private endpoint subnet/CIDR and the configured client ID's mapping to the
approved backend identity, effective permissions, private DNS and execution
environment. The supplied CIDR and configured identity are not trusted evidence
or authorization. Review the installed SDK's retry and logging behavior, the
metadata operation's bearer support and permissions, token handling, isolated
worker termination, and the intended no-visitor-data scope. Ensure runtime
debugging, instrumentation, and platform logging cannot capture identity
secrets or request authorization headers. Obtain a specific short-lived
owner-approved connectivity-test authorization; inspection or deletion
approval does not grant it.

The smallest prospective execution mechanism is a separately reviewed,
short-lived one-shot entry point in the existing isolated Linux backend
environment, with an independently verified authorization boundary and
trusted configuration, followed by removal or renewed disabling. Such an
entry point is **not implemented**. Do not deploy or invoke the diagnostic
until that mechanism and its private-network path are independently approved.

Run the local tests from this backend worktree in PowerShell 7:

```powershell
node --test scripts\kiosk-bootstrap\inspect-isolated-table-connectivity.test.mjs
node --test scripts\kiosk-bootstrap\simulate-synthetic-intake-cleanup.test.mjs
node --test scripts\kiosk-bootstrap\simulate-synthetic-intake-inspection.test.mjs
node --test scripts\kiosk-bootstrap\assess-synthetic-inspection-authority.test.mjs
```

## Capture the future synthetic submission identity

The form generates a UUIDv4 immediately before submission and sends it as the
`Idempotency-Key` header. The dashboard source includes a default-off,
synthetic-only receipt foundation; its deployment and enablement are not
assumed. Any future capture method must independently bind the UUID to the
approved payload and confirmed response. If the exact request cannot be
identified, stop; do not infer the UUID or search visitor records. An
uncertain response is not proof of failure.

Keep the UUID and evidence only in the approved restricted authorization
channel. Do not capture or export cookies, tokens, or visitor details. The
simulator's preselected payload uses a reserved `.invalid` address and
declines contact; a future test must use exactly that payload.

## Prerequisites for any future live operation

- Obtain a separate short-lived `kiosk.synthetic-intake.inspect-one.v1`
  approval bound to the exact isolated subscription, resource group, account,
  table, partition, UUID, synthetic payload fingerprint, UUID evidence,
  operator identity, operation ID, issuer, audience, and validity period.
  The contract limits validity to 15 minutes. A trusted source must verify
  operator identity, signer authority, UUID provenance, and durable single-use
  consumption independently; caller input and fixture data cannot do so.
- Inspection approval never authorizes deletion. Any future deletion requires
  a separately verified action-specific approval bound to the inspected ETag.
- A future trusted consumption service must atomically create a unique,
  durable single-use claim and matching audit receipt bound to the operation
  ID and approved scope, issuer, audience, operator, UUID evidence and expiry.
  Concurrent attempts and replay must fail across restarts and instances.
  Conflicts, partial results, timeouts, or unverifiable outcomes must stop
  without automatic retry or a live inspection.
- A real trusted verifier, UUID-provenance verifier, and durable approval
  consumer have not been implemented. The private read adapter cannot be
  invoked through its disabled entry point. The existing bootstrap approval
  components are design-only and must not be reused as approval.
- Establish and verify the managed-identity execution context and exact
  account endpoint and approved private network path. Do not use shared keys
  or create or grant permissions.
  A local workstation must not be assumed to have that managed identity.
  Effective Table data permissions have not been verified.
- Confirm the target table already exists; a missing table or row is a stop.
  Do not call `ensureTable`, list rows, or search for a visitor.
- Read only the exact partition and UUID with `getEntity`. Verify the
  preapproved synthetic fields, repository-compatible fingerprint, source,
  pending status, exact keys, and non-wildcard ETag. Reject unknown fields,
  claim/reconciliation markers, discrepancies, or uncertain history.
  A pending row alone cannot prove that no external canonical visitor exists.
- If all separate approvals and checks are satisfied, a reviewed future
  implementation must perform at most one
  `deleteEntity(partition, uuid, { etag: inspectedEtag })` operation. The
  SDK defaults a missing ETag to `*`, so omission or wildcard must fail
  closed. A changed ETag, conflict, timeout, or uncertain result requires
  stopping for manual reconciliation; never retry automatically.

Do not modify canonical visitors, activate reconciliation or Staff Authority,
or contact visitors. None of these prerequisites authorizes execution now.
