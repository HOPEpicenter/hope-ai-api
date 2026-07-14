# HOPE Ministry OS Documentation

## Start Here

HOPE Ministry OS is a pastoral operating system built around care, discipleship, spiritual formation, and pastoral intelligence.

This directory contains strategic, architectural, operational, and historical documentation.

## Documentation Governance

Every active fact has one authoritative document.

If a change requires updating multiple active documents with the same information, the documentation architecture should be improved rather than duplicating the information.

Other documents may link to or summarize an authoritative source, but they must not become competing sources of truth.

Historical documents may record completed work, but they must not define current architecture, pilot readiness, or roadmap status.

## Documentation Map

| Question | Authoritative Document |
| --- | --- |
| Where is HOPE Ministry OS going? | `MASTER_PLAN.md` |
| Is the system ready for pilot? | `architecture/PILOT_READINESS_V2.md` |
| What ministry state should each workspace display? | `architecture/MINISTRY_STATE_MATRIX.md` |
| How should a pastor move through the system each morning? | `architecture/MORNING_MINISTRY_WORKFLOW.md` |
| What work remains before pilot? | `architecture/PILOT_READINESS_BOARD.md` |
| Why was an architectural choice made? | `architecture/DECISIONS.md` |
| What evidence supports the final pilot decision? | `architecture/PILOT_ACCEPTANCE_REPORT.md` |
| What changed historically? | `UPDATE_NOTES.md` |
| What engineering work was completed historically? | `master-checklist.md` |

## Active Documents

### `MASTER_PLAN.md`

Owns:

- ministry product vision;
- strategic direction;
- current program phase;
- future phases and intentionally deferred scope.

It must not duplicate detailed pilot status, verification evidence, or implementation history.

### `architecture/PILOT_READINESS_V2.md`

Owns:

- current pilot readiness;
- remaining pilot gates;
- open pilot risks;
- launch recommendation.

This is the only active source of truth for whether the system is ready for pilot.

### `architecture/MINISTRY_STATE_MATRIX.md`

Owns:

- canonical ministry concepts;
- backend ownership of those concepts;
- cross-page consistency invariants.

### `architecture/MORNING_MINISTRY_WORKFLOW.md`

Owns:

- the pastor-facing daily workflow;
- workflow acceptance conditions;
- ministry scenario validation.

### `architecture/PILOT_READINESS_BOARD.md`

Owns:

- active execution status for the remaining pilot-readiness waves.

It should be archived or retired after pilot completion.

### `architecture/DECISIONS.md`

Owns:

- durable architectural decisions;
- the reasons behind those decisions;
- their consequences.

### `architecture/PILOT_ACCEPTANCE_REPORT.md`

Will own:

- completed verification evidence;
- known limitations;
- deferred scope;
- the final go or no-go recommendation.

This report will be created when pilot validation begins and completed before launch approval.

## Historical Documents

### `UPDATE_NOTES.md`

Historical release and change record.

It may describe completed work but must not contain current roadmap or pilot-status authority.

### `master-checklist.md`

Historical engineering completion log.

It may preserve prior implementation checklists but must not be used as the active pilot checklist.

## Documentation Update Rule

Before editing documentation:

1. identify which document owns the fact;
2. update that document only;
3. link to the authoritative document from other locations when context is needed;
4. do not copy active status, risks, or checklists into historical records.

## Software Architecture Parallel

The documentation model mirrors the software architecture:

- commands create canonical events;
- events build projections;
- projections drive the UI;
- authoritative documents own facts;
- other documents reference those facts.
