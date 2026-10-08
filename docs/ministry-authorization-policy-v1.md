# HOPE Ministry OS - Ministry Authorization Policy v1

Status: Approved product policy; implementation pending.
Scope: Authorization contract only. No runtime enforcement change.

## Governing Principle

Pastors provide congregation-wide ministry oversight.
Ministry Leaders manage work only within authorized Ministry Areas.
Ordinary Staff see and perform only explicitly assigned work.
Technical administration does not independently grant pastoral access.

All decisions must be made by the backend using verified identity
and authoritative ministry relationships.

## Roles and Scope

### Pastor

- May oversee ministry activity across the congregation.
- May assign and reassign Six-Week follow-ups across ministries.
- May supervise pastoral care and journey activity.
- Confidential information remains subject to specific restrictions.

### Ministry Leader

- May supervise authorized Ministry Areas.
- May assign and reassign Six-Week plans in those areas.
- May see team assignments and unassigned work in those areas.
- Authority requires a canonical Ministry Area leadership relationship.
- A role label alone does not authorize another ministry area.

### Care Team and Ordinary Staff

- May see only people and work explicitly assigned to them.
- May record permitted outcomes for their assigned work.
- May not self-claim an unassigned Six-Week plan.
- May not assign or reassign Six-Week ownership.
- May not access shared queues or another Staff member's work.

### System Administrator

- System administration does not imply pastoral authority.
- Administrative functions require separate explicit authorization.
- Technical administration must not bypass ministry record scoping.

## Six-Week Assignment Policy

- Only a Pastor or authorized Ministry Leader may assign ownership.
- An authorized Ministry Leader is scoped to the plan's responsible area.
- Ordinary Staff may not self-claim, including an unassigned plan.
- Assigned Staff may complete permitted tasks on their own plan.
- Ownership changes must retain canonical actor attribution and audit.
- Unassigned plans appear only in authorized leadership queues.
- Staff queues contain only plans owned by the verified Staff actor.
- Direct reads and mutations must enforce equivalent scope rules.

## Ministry Area Relationships

- Canonical opaque Ministry Area IDs are authoritative.
- Names are display-only and must not determine authorization.
- Renames must not change Ministry Area identity.
- Inactive areas do not create new assignment authority.
- Multiple authorized leaders may supervise one area.
- Staff membership does not automatically confer leadership authority.
- A Six-Week plan needs an explicit responsible Ministry Area.
- Missing or ambiguous scope must not grant broad access.
- Cross-ministry sharing requires an explicit, audited authorization.

## Read and Mutation Boundaries

Authorization must cover:

- Six-Week queues, details, history, ownership, and task outcomes
- Person 360 direct links and sections
- Care and Journey records
- Search, exports, summaries, counts, and notifications
- Confidential pastoral information and shared care context

Hiding information in the dashboard is not authorization.

## Confidentiality

- Shared care context and confidential pastoral notes are separate.
- Assigned Staff access must not expose unrelated pastoral history.
- Pastor-wide oversight does not remove special confidentiality rules.
- Exceptional access requires explicit authorization and audit.

## Trusted Identity

- The backend must independently verify trusted caller identity.
- Staff IDs supplied by callers are not authentication evidence.
- Verified Entra identity must resolve to one active canonical Staff.
- Role, area, assignment, and requested action determine access.
- Missing or invalid evidence must fail closed when enforced.
- No production enforcement changes are authorized by this document.

## Acceptance Requirements

Future enforcement tests must verify:

1. Pastor-wide authorized assignment and oversight.
2. Ministry Leader access within an assigned Ministry Area.
3. Ministry Leader denial outside authorized areas.
4. Care Team access only to assigned work.
5. Care Team self-claim denied.
6. Care Team reassignment denied.
7. Unassigned queue hidden from ordinary Staff.
8. Direct Person 360 and API scope enforcement.
9. Cross-ministry confidentiality boundaries.
10. Inactive Staff and missing identity denied.
11. Forged or mismatched Staff actor evidence rejected.
12. Correct actor attribution and durable audit history.
13. Pagination, counts, exports, and search scoped consistently.
14. Existing ministry data preserved during migration.

## Migration Requirements

Implementation is staged through focused draft PRs.

Existing permissive behavior is not evidence of compliance.
All production enforcement changes require separate approval.
Do not rewrite real ministry data or historical audit events.
Do not change Azure settings or feature flags as part of this PR.

## Open Implementation Design

Determine the authoritative relationship between each Six-Week
plan and its responsible canonical Ministry Area before enforcing
leader-scoped assignment.

Determine how existing plans lacking that relationship will be
handled safely without guessing from visitor attributes or names.

This contract does not itself grant or revoke runtime permissions.
