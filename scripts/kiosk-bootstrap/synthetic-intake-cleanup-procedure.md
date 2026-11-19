# Synthetic kiosk intake cleanup: preparation only

The accompanying simulator is restricted to branded in-memory fixtures. It
cannot read Azure or delete a live row. Its capture and approval objects are
synthetic test doubles, not evidence or authorization. No CLI flag enables
live access. A live adapter and a trusted approval verifier do not exist.
The read-only `inspectSyntheticIntakeFixture` entry point also accepts only
branded in-memory fixtures, defaults to disabled, and returns status only.
Its `enabled` option and fixture capture are never live authorization.

Run the local tests from this backend worktree in PowerShell 7:

```powershell
node --test scripts\kiosk-bootstrap\simulate-synthetic-intake-cleanup.test.mjs
node --test scripts\kiosk-bootstrap\simulate-synthetic-intake-inspection.test.mjs
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

- Obtain a separate operation-specific approval bound to the exact isolated
  subscription, resource group, account, table, partition, captured UUID,
  synthetic payload fingerprint, inspected ETag, action, and validity period.
  Verify the approval through an independent trusted mechanism, not a flag,
  environment variable, or the simulator's test objects.
- A real trusted verifier and read-only live adapter have not been implemented.
  The existing bootstrap approval components are design-only and do not grant
  authority for this inspection. They must not be reused as approval.
- Establish and verify the managed-identity execution context and exact
  account endpoint and approved private network path. Do not use shared keys
  or create or grant permissions.
  A local workstation must not be assumed to have that managed identity.
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
