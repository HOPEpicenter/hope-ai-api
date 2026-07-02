# HOPE System Architecture Flow - Pilot Readiness v2

```text
[Visitor Identity] 🟢
        |
        v
[Engagement + Formation Events] 🟢
        |
        v
[Formation Profile Projection] 🟢
        |
        +--> [Journey Story] 🟢 --> [Dashboard Journey] 🟢
        |
        +--> [Care Candidate Projection] 🟢 --> [Dashboard Care] 🟢
        |
        +--> [Dashboard Card] 🟢 --> [Today / Snapshot Rail / Person 360] 🟢
        |
        +--> [Activity Intelligence] 🟢 --> [Insights / Opportunity Worklists] 🟢
        |
        +--> [Integration Timeline] 🟢 --> [Person 360 Full Story] 🟢
        |
        v
[Express + Azure Functions Route Parity] 🟢
        |
        v
[Dashboard Next Server Loaders] 🟢
        |
        v
[Pastor Workflow Experience] 🟡
        |
        v
[Pilot Validation] 🟡
```

Legend:

- 🟢 Production ready / merged / validated
- 🟡 Needs audit or final pilot validation
- 🔵 Under construction
- 🟣 Planned
- ⚪ Deferred
- 🔴 Blocked

## Current Focus

🟡 Documentation reconciliation and pilot workflow audit.

## Do Not Rebuild

- Canonical dashboard cards.
- Care queue projections.
- Activity intelligence opportunity worklists.
- Followup outcome semantics.
- Global visitor context.
- PersonMinistryHeader.
- DataHealthBanner.
- Backend route parity.
