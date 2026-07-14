# HOPE Ministry OS — Pilot Readiness Board

Date: 2026-07-14

Status: Pilot Hardening

## Pilot Objective

A pastor can confidently open HOPE Ministry OS every morning, understand who needs attention, act faithfully, share responsibility, and trust that every workspace reflects the same ministry truth.

## Scope Rule

Every pre-pilot PR must do at least one of the following:

1. increase ministry trust;
2. reduce pilot risk;
3. prove cross-page consistency;
4. synchronize documentation with verified implementation.

Phase 2 intelligence and communication systems remain frozen until pilot completion.

## Readiness Summary

| Area | Status | Evidence or Remaining Gate |
| --- | --- | --- |
| Backend contracts | Complete | Verified dashboard-facing contracts are deployed |
| Canonical event sourcing | Complete | Commands write canonical engagement or formation events |
| Deterministic replay | Complete | Replay, idempotency, projection, and ordering coverage exists |
| Today | Feature complete | Morning-loop acceptance remains |
| Person 360 | Feature complete | Cross-page acceptance remains |
| Journey | Feature complete | Cross-page next-step validation remains |
| Care | Feature complete | Ownership edge-case validation remains |
| Insights | Feature complete | Worklist resolution validation remains |
| Staff directory | Complete | Canonical projected directory in use |
| Staff administration | Complete | Dashboard create, edit, and deactivate workflow merged |
| Editable pastoral notes | Complete | Dashboard edit and audit experience merged |
| Canonical care ownership | Complete | Assignment and unassignment now use formation events |
| Actor provenance | Complete | Dashboard ownership commands send actor identity |
| Admin readiness | Feature complete | Final launch-readiness review remains |
| Authentication and authorization | Open pilot gate | Pilot access policy and sensitive-action boundaries require explicit approval |
| Cross-page consistency | In validation | Ministry State Matrix must be proven |
| Ministry acceptance | Not complete | Pastor walkthrough required |
| Documentation freeze | Not complete | Current documentation must match July implementation |
| Controlled pilot decision | Pending | Depends on completion of launch gates |

## Wave 1 — Architecture Baseline

Status: In progress

- [x] Create Pilot Readiness documentation branch.
- [ ] Update `docs/architecture/PILOT_READINESS_V2.md`.
- [ ] Update `docs/MASTER_PLAN.md`.
- [ ] Update `docs/master-checklist.md`.
- [ ] Update `docs/UPDATE_NOTES.md`.
- [ ] Add Ministry State Matrix.
- [ ] Add Morning Ministry Workflow.
- [ ] Add Pilot Readiness Board.
- [ ] Validate documentation links and formatting.
- [ ] Commit and open documentation PR.
- [ ] CI passes.
- [ ] Merge through PR.

## Wave 2 — Cross-Page Architecture Validation

Status: Not started

- [ ] Verify person identity consistency.
- [ ] Verify care-owner consistency.
- [ ] Verify ownership event history.
- [ ] Verify formation-stage consistency.
- [ ] Verify next-step consistency.
- [ ] Verify needs-attention consistency.
- [ ] Verify meaningful-contact consistency.
- [ ] Verify pastoral-note consistency.
- [ ] Verify timeline consistency.
- [ ] Verify recommended-action consistency.
- [ ] Record every disagreement as an explicit pilot defect.
- [ ] Confirm no dashboard page invents business state.

## Wave 3 — Ministry Scenario Validation

Status: Not started

- [ ] New person to active care.
- [ ] Ownership transfer.
- [ ] Unassigned person remains visible.
- [ ] Pastoral note correction.
- [ ] Journey next-step selection and completion.
- [ ] Care outcome resolution.
- [ ] Partial backend failure.
- [ ] Staff deactivation with historical assignments.
- [ ] Duplicate command or event replay.
- [ ] Out-of-order historical event behavior.

## Wave 4 — Pilot Access and Safety

Status: Not started

- [ ] Define pilot user list.
- [ ] Define who may view pastoral notes.
- [ ] Define who may edit pastoral notes.
- [ ] Define who may assign care.
- [ ] Define who may manage staff.
- [ ] Define who may access system readiness details.
- [ ] Verify actor provenance for sensitive actions.
- [ ] Verify inactive staff access and assignment behavior.
- [ ] Document interim pilot authorization limitations.
- [ ] Approve controlled-pilot risk posture.

## Wave 5 — Pastoral Trust Review

Status: Not started

- [ ] Today clearly answers who needs attention.
- [ ] Every priority item explains why.
- [ ] Every action identifies responsibility.
- [ ] Person 360 communicates the ministry story in under one minute.
- [ ] Journey communicates formation movement rather than duplicating Timeline.
- [ ] Care communicates responsibility and the next faithful action.
- [ ] Insights produces ministry worklists rather than unexplained analytics.
- [ ] Admin separates ministry administration from engineering diagnostics.
- [ ] Raw technical IDs and event codes are absent from pastor-facing experiences.
- [ ] Navigation preserves person and worklist context.

## Wave 6 — Controlled Pilot Launch

Status: Not started

- [ ] Backend CI is green.
- [ ] Dashboard CI is green.
- [ ] Azure staging deploy is successful.
- [ ] Dashboard production deploy is verified.
- [ ] Production environment configuration is verified.
- [ ] End-to-end ministry walkthrough passes.
- [ ] Ministry acceptance walkthrough passes.
- [ ] Known pilot limitations are documented.
- [ ] Rollback and issue-triage procedures are documented.
- [ ] Documentation freeze is complete.
- [ ] Controlled pilot is approved.

## Frozen Phase 2 Work

The following remain intentionally out of scope until pilot completion:

- Community Intelligence Engine
- Email Engine
- SMS Engine
- Volunteer Ministry
- Giving Intelligence
- Attendance Intelligence
- Neighborhood Intelligence
- Prayer Intelligence
- Outreach Intelligence
- Family Intelligence
- Community Mapping

## Current Launch Recommendation

The architecture is suitable for a controlled live ministry pilot after:

1. documentation reflects the verified July implementation;
2. the morning ministry workflow passes;
3. cross-page ministry invariants pass;
4. pilot authentication and authorization boundaries are explicitly approved.

Broad organization-wide launch remains deferred until ministry acceptance and pilot findings are incorporated.
