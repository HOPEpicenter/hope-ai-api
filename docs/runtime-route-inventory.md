# Runtime Route Inventory

This document records the current HOPE API runtime route surface.

Azure Functions are configured with `authLevel: anonymous`, but protected routes enforce `HOPE_API_KEY` inside the handler through `requireApiKeyForFunction(...)` or Express `requireApiKey(...)`.

## Surface Categories

| Surface | Meaning | Auth |
|---|---|---|
| Public health | Safe liveness/version endpoints | None |
| Protected API | Product/API surface under `/api/*` | `HOPE_API_KEY` |
| Ops tooling | Dev/admin/operator tooling under `/ops/*` | `HOPE_API_KEY` |
| Internal ops | Internal projection/audit tooling under `/_ops/*` | `HOPE_API_KEY` |

## Public Health

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/health` | API health check | None |
| GET | `/api/version` | API version/build info | None |
| GET | `/ops/health` | Local/ops host health check | None |

## Protected API

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/visitors` | Create visitor | `HOPE_API_KEY` where protected adapter is used |
| GET | `/api/visitors` | List visitors | `HOPE_API_KEY` where protected adapter is used |
| GET | `/api/visitors/{id}` | Read visitor | `HOPE_API_KEY` where protected adapter is used |
| GET | `/api/visitors/{id}/summary` | Visitor summary | `HOPE_API_KEY` |
| GET | `/api/visitors/{id}/dashboard-card` | Visitor dashboard card | `HOPE_API_KEY` |
| GET | `/api/visitors/{id}/journey` | Visitor journey | `HOPE_API_KEY` |
| GET | `/api/visitors/{id}/activity-insights` | Visitor activity insights | `HOPE_API_KEY` |
| POST | `/api/formation/events` | Append Formation event | `HOPE_API_KEY` |
| GET | `/api/formation/timeline` | Formation timeline | `HOPE_API_KEY` |
| GET | `/api/formation/profiles` | Formation profiles list | `HOPE_API_KEY` |
| GET | `/api/visitors/{id}/formation/events` | Visitor Formation events | `HOPE_API_KEY` |
| GET | `/api/visitors/{id}/formation/profile` | Visitor Formation profile | `HOPE_API_KEY` |
| POST | `/api/formation/profiles/{id}/rebuild` | Rebuild Formation profile projection | `HOPE_API_KEY` |
| POST | `/api/engagements/events` | Append Engagement event | `HOPE_API_KEY` |
| GET | `/api/engagements/timeline` | Engagement timeline | `HOPE_API_KEY` |
| GET | `/api/engagements/score` | Engagement score | `HOPE_API_KEY` |
| GET | `/api/engagements/status` | Engagement status | `HOPE_API_KEY` |
| GET | `/api/integration/timeline` | Integration timeline | `HOPE_API_KEY` |
| GET | `/api/integration/summary` | Integration summary | `HOPE_API_KEY` |
| GET | `/api/integration/global-timeline` | Global integration timeline | `HOPE_API_KEY` |
| GET | `/api/legacy/export` | Legacy export | `HOPE_API_KEY` |
| GET | `/api/dashboard/followups` | Dashboard followups/read model | `HOPE_API_KEY` |
| GET | `/api/_protected/ping` | Protected auth probe | `HOPE_API_KEY` |

## Ops Tooling

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/ops/followups` | Ops followups queue/read model | `HOPE_API_KEY` |
| GET | `/ops/task-preview-summary` | Lightweight ops task preview summary | `HOPE_API_KEY` |
| GET | `/ops/task-preview-simulation` | Ops task preview simulation | `HOPE_API_KEY` |
| GET | `/ops/visitors` | Ops visitor list | `HOPE_API_KEY` |
| POST | `/ops/visitors` | Ops visitor create/dev tooling | `HOPE_API_KEY` |
| GET | `/ops/visitors/{id}/dashboard` | Ops visitor dashboard | `HOPE_API_KEY` |
| GET | `/ops/visitors/{id}/timeline` | Ops visitor timeline | `HOPE_API_KEY` |
| POST | `/ops/visitors/{id}/events` | Ops append visitor event/dev tooling | `HOPE_API_KEY` |
| POST | `/ops/populate-dummy` | Dev dummy data tooling | `HOPE_API_KEY` |
| GET | `/ops/engagements` | Ops engagement list | `HOPE_API_KEY` |
| POST | `/ops/engagements` | Ops engagement create | `HOPE_API_KEY` |
| GET | `/ops/engagements/summary` | Ops engagement summary | `HOPE_API_KEY` |

## Internal Ops

| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/_ops/formation/profile-audit` | Formation profile audit/repair tooling | `HOPE_API_KEY` |
| GET | `/api/_ops/formation/recent-events` | Recent Formation events inspection | `HOPE_API_KEY` |

## Notes

- `/ops/*` remains dev/admin/operator tooling, not the product/public surface.
- `/api/*` is the protected product/API surface unless listed under Public Health.
- `/_ops/*` routes are internal operational tooling and should not be used as product/dashboard APIs.
- This inventory is a baseline for future route audits, authorization work, and production readiness reviews.
