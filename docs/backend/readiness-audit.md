# Backend Readiness Audit

Date: 2026-06-17

Purpose: track backend readiness after Express/Azure Functions route parity and primary contract coverage hardening.

## Current status

- Express route parity is effectively aligned with Azure Functions HTTP routes.
- Primary public/dashboard-facing contract coverage is in place.
- CI, regression, smoke, and staging deploys are green.
- Remaining work should focus on readiness quality, not endpoint hunting.

## Readiness checklist

| Area | Status | Notes |
|---|---:|---|
| Route parity | Complete | Covered by parity PRs and inventory. |
| Primary contract coverage | Strong | Dashboard card and activity intelligence now covered. |
| Auth behavior | Needs audit | Confirm public vs protected behavior is intentional for every public-ish route. |
| Request validation | Needs audit | Confirm bad inputs produce stable 400s. |
| Error shape | Needs audit | Confirm API errors are JSON and include request IDs where expected. |
| Pagination/cursors | Strong | Timeline/care/ops pagination contracts exist; confirm any remaining list endpoints. |
| Projection integrity | Strong | Care, formation, integration guardrails exist. |
| Staging validation | Strong | Deploy workflow green; remote smoke remains the main external validation path. |
| Seed/dev scripts | Needs review | Verify dev seed and helper scripts still match current backend surfaces. |
| Dashboard readiness | In progress | Backend should drive new dashboard, not old-dashboard patching. |

## Next candidate audit PRs

1. Auth/error-shape audit for public-ish `/api` routes.
2. Validation contract audit for list/query endpoints.
3. Dev seed/helper script review after parity hardening.
4. Remote staging smoke review for pilot-critical routes.

## Stop conditions

Do not add new backend routes unless a pilot-critical gap is proven.
Do not spend time fixing old dashboard issues unless they block backend validation.
Do not add contracts for OPS/legacy surfaces unless they become operationally important.