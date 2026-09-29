# Ministry Area Operational Readiness v1

`GET /api/ministry-areas/{ministryAreaId}/readiness` is an administrator-only,
read-only composition of existing canonical Ministry Area, Staff, care, and
six-week follow-up reads. It creates no persistent projection or new source of
truth.

## Ownership Scope

The Ministry Area and its Staff roster come from the canonical Ministry Area
Overview. The ownership set includes every canonical Staff identity linked by
`staff.ministryAreaId === ministryAreaId`, regardless of Staff status. A care
candidate is attributed only through its canonical `assignedTo` Staff ID. A
six-week follow-up is attributed only through its canonical
`plan.ownerStaffId`. Unassigned care and unowned follow-up plans are excluded,
as is work owned by Staff outside the Ministry Area.

There is no canonical visitor/person-to-Ministry-Area relationship in v1.
Visitor identity, ministry connections, care opener, leader metadata, and the
current administrator are not ownership evidence. Leadership and membership
are descriptive only and do not grant or imply authorization.

## Canonical Sources

- Ministry Area and linked Staff: `readMinistryAreaOverview` and its canonical
  Ministry Area/Staff projection reads.
- Care: Formation profiles validated against existing non-synthetic visitors,
  projected by `readCareCandidateList`; readiness uses its canonical
  `assignedTo`, `carePriority`, `careAgeBucket`, and `escalationLevel` fields.
- Six-week follow-up: `readSixWeekVisitorFollowupQueue`, the same queue read
  used by `GET /api/six-week-followups`. Readiness uses `plan.ownerStaffId`
  and `plan.nextTask.status` (`due` or `overdue`) without recalculating task
  state.

If a required source fails, the request fails with the normal server error
response. A source failure is never represented as zero work.

`attention.total` is `urgentCare + overdueFollowups`. It is an operational
signal count, not a unique-person count; v1 does not deduplicate a person who
appears in both categories.

## Recommended First Action

The backend authors one deterministic `recommendedFirstAction` using only the
readiness counts already derived by this service. Its fixed precedence is
urgent care, overdue follow-ups, escalated care, elevated care, stale care,
then due follow-ups. The action is aggregate-only and does not identify a
visitor or establish a visitor-to-Ministry-Area relationship. Ministry Area
membership and leadership are descriptive and do not grant permissions. The
action is `null` when none of the supported signals is present.