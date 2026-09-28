# Ministry Area leadership metadata

Canonical Ministry Areas may optionally reference one Staff identity through
`leaderStaffId`.

This field is descriptive ministry metadata. It does not grant dashboard,
backend, administrator, care, assignment, or any other authorization.

## Write rules

Leadership is changed through the existing administrator-only Ministry Area
update command:

`PATCH /api/ministry-areas/{ministryAreaId}`

Supported values:

- a canonical active Staff ID assigns or replaces the Ministry Area leader;
- `null` clears the current leader;
- blank Staff IDs are rejected;
- missing Staff identities are rejected;
- inactive Staff identities cannot be newly assigned as leaders.

If a linked leader later becomes inactive, the existing `leaderStaffId`
remains in the Ministry Area projection until an administrator changes or
clears it. This preserves historical administrative truth and avoids silently
rewriting Ministry Area state.

## Authorization boundary

`leaderStaffId` must never be interpreted as authorization.

Administrator authorization remains controlled by the existing canonical
administrator boundary. Ministry Area leadership does not imply application
access, administrator privileges, ownership authorization, or permission to
mutate ministry records.
