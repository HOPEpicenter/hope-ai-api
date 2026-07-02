# Canonical Services and Duplicate-Prevention Inventory

## Rule

Before adding any new service, endpoint, or dashboard derivation, check this file and the PR ledger.

## Known Canonical Families

| Family | Status | Ownership |
|---|---|---|
| Visitor identity | Backend | Visitor records and profile fields. |
| Formation profile | Backend | Canonical outcome/journey/followup state. |
| Dashboard card | Backend | Person-facing canonical summary for dashboard surfaces. |
| Care candidate list | Backend | Care candidate projection, priority, age, escalation, action, assignment. |
| Care summary/export | Backend | Care rollups and operational export. |
| Followup queues | Backend | Dashboard and OPS queue projections. |
| Activity intelligence | Backend | Formation cohorts, opportunities, worklists. |
| Opportunity narrative | Backend | Opportunity action/reason/resolution/narrative. |
| Integration/global timeline | Backend | Ministry story/event timeline. |
| Task preview summary | Backend OPS | Read-only deterministic preview; no task persistence/orchestration. |
| Dashboard presentation | Frontend | Language, layout, navigation, accessibility, workflow presentation. |

## Do Not Duplicate

- Followup status derivation.
- Care priority/age/escalation derivation.
- Journey/formation stage semantics.
- Opportunity segment/action/reason/resolution logic.
- Dashboard card risk/recommendation/priority fields.
- Timeline event ordering.
- Actor attribution and operator identity rules.
