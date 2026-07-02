# HOPE System Ownership

**Status:** Living architecture guardrail  
**Purpose:** Define which layer owns each system responsibility so future work does not duplicate backend logic in the dashboard.

## Core Principle

The backend owns ministry truth.

The dashboard owns ministry presentation.

No frontend code should infer, duplicate, or override backend-authored ministry state.

## Ownership Matrix

| Concern | Owner | Notes |
|---|---|---|
| Visitor identity | Backend | Dashboard may display and edit through backend contracts only. |
| Contact fields | Backend | Name, email, phone, address, birthday are backend-owned identity fields. |
| Formation events | Backend | Canonical write path for journey and ministry lifecycle activity. |
| Formation profile | Backend | Canonical projection of formation state. |
| Journey state | Backend | Dashboard presents backend-authored journey state and story evidence. |
| Care state | Backend | Care candidates, urgency, ownership, escalation, and outcomes are backend-owned. |
| Follow-up state | Backend | Terminal/non-terminal semantics live in backend contracts and projections. |
| Prayer state | Backend | Prayer request timestamps and related projections are backend-owned. |
| Next-step state | Backend | Selection and completion are written through backend formation events. |
| Opportunity intelligence | Backend | Segments, recommended actions, reasons, resolution metadata, and evidence are backend-authored. |
| Activity intelligence | Backend | Dashboard consumes backend-composed intelligence only. |
| Timeline ordering | Backend | Integration/global timeline ordering and pagination are backend-owned. |
| Dashboard cards | Backend | Canonical visitor dashboard card is backend-authored. |
| Task preview / simulation | Backend | Read-only OPS simulation and preview summaries remain backend-owned. |
| Operator attribution | Backend | Actor identity, validation, and registry are backend-owned. |
| Route protection | Backend | API key enforcement and protected route behavior are backend-owned. |
| Deployment/runtime layout | Backend | Azure Functions and Express parity belong to API repo. |
| Pastor language | Dashboard | Dashboard may translate backend facts into pastor-facing language. |
| Page layout | Dashboard | Workspace layout, spacing, and component composition are dashboard-owned. |
| Navigation | Dashboard | Visitor context propagation and workspace navigation are dashboard-owned. |
| Loading states | Dashboard | Dashboard owns graceful loading and partial-failure presentation. |
| Empty states | Dashboard | Dashboard owns pastor-facing empty-state wording without changing backend meaning. |
| Accessibility | Dashboard | Keyboard, focus, semantic labels, and screen-reader behavior are dashboard-owned. |
| Visual design | Dashboard | Cards, typography, colors, and responsive layout are dashboard-owned. |
| Workflow presentation | Dashboard | Dashboard can guide pastors through backend-authored actions but cannot invent state. |
| Pilot operations documentation | Shared | API owns backend operations docs; Dashboard owns UI operation notes. |

## Hard Boundaries

Dashboard must not:

- derive ministry lifecycle state
- calculate care urgency
- decide follow-up terminality
- infer formation stage
- rank opportunity segments
- create frontend-only recommendations
- persist ministry state
- start orchestration, schedulers, or background mutation loops
- bypass backend operator attribution or API-key rules

Backend must not:

- encode page-specific layout
- own visual hierarchy
- own CSS or component structure
- force pastor-facing copy where structured facts are sufficient
- duplicate dashboard presentation concerns

## Recommendation Gate

Before building a new feature, confirm:

1. Which layer owns the truth?
2. Is there already a canonical backend service?
3. Is the dashboard only presenting backend-authored data?
4. Does the proposed change introduce duplicate logic?
5. Does the change belong in API, Dashboard, or documentation?

## Related Documents

- `docs/architecture/PILOT_READINESS_V2.md`
- `docs/architecture/API_INVENTORY.md`
- `docs/architecture/CANONICAL_SERVICES.md`
- `docs/architecture/DASHBOARD_INVENTORY.md`
- `docs/architecture/PILOT_BACKLOG.md`
