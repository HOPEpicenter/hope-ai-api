# UPDATE_NOTES.md

## 2026-02-27

- ✅ OPS: GET /ops/followups now ensures the formation profiles table exists before listing (prevents errors on fresh Azurite).
- ✅ OPS: followups items now include esolvedForAssignment so queue logic can suppress “already resolved” rows without adding write endpoints under /ops/*.
## 2026-02-25

- ✅ Merged **#139**: regression runner now includes integration summary followupReason/assignedTo consistency contract (runs only when HOPE_API_KEY is set).
- ✅ Merged **#140**: CI uses repo secret HOPE_API_KEY with a safe fallback to ci-key (keeps CI green until secrets are configured).
- ✅ Merged **#141**: nsureTableExists hardened for Azurite/CI races (treat already-exists cases as OK: 409 + common codes).
- 🧹 Closed stale bundled CI PRs (**#2–#5**) and recreated minimal safe changes on current main.


### OPS vs API surface (dev discipline)

- `/ops/*` is dev/admin tooling only (internal operators + scripts; not the public surface).
- `/api/*` is the public-ish surface (the contract we treat as “product/API”).
- After every major update, verify/update dev seed + helper scripts (`dev-seed.ps1`, `dev-functions.ps1`, `dev-up.ps1`) and record it here + in the master plan (stay prod-like).
- 2026-02-23: Post-merge hardening after integration deep paging:
  - Added timeline paging regressions (limit=1 no overlap; cross-stream boundary).
  - Smoke now validates cursor is URL-safe (no whitespace) and round-trips with URL escaping.
  - Local dev: smoke storage-backed EMAIL index repair requires STORAGE_CONNECTION_STRING (Azurite ok via UseDevelopmentStorage=true); otherwise it is skipped.

## 2026-02-26

- ✅ Fixed regression runner parse failure by removing leftover merge markers in scripts/regression.ps1.
- ✅ Verified local regression runs green with HOPE_API_KEY set (integration summary assignedTo + followup consistency contracts executed).


- ✅ Contract suite normalizes HOPE_BASE_URL to root (prevents /api/api path bugs).

