# Staging Health Checklist

## Purpose

Use this checklist before and during a controlled pilot session.

## Pre-Pilot Checks

- [ ] Latest CI run is green.
- [ ] Latest staging deployment is green.
- [ ] API health endpoint responds.
- [ ] API version endpoint responds.
- [ ] Dashboard loads.
- [ ] Today cockpit loads.
- [ ] Ready Care cards load or show a valid empty state.
- [ ] Visitor detail opens from a Ready Care card.
- [ ] Mark Contacted works on a test record.
- [ ] Record Outcome works on a test record.
- [ ] Queue updates after contact/outcome actions.
- [ ] Known latency expectations have been communicated.

## During-Pilot Checks

- [ ] Operators can access the dashboard.
- [ ] Operators can identify Ready Care items.
- [ ] Operators can open visitor details.
- [ ] Operators can complete the workflow.
- [ ] Any errors are recorded.

## If a Check Fails

1. Stop pilot actions that could create duplicate mutations.
2. Capture the time, operator, action, and visible error.
3. Check whether staging deployment is green.
4. Determine whether the issue is latency or failure.
5. Record the incident.
6. Resume only after validation.

## Critical No-Go Signals

- Dashboard cannot load.
- Ready Care cannot load.
- Visitor detail cannot open.
- Mark Contacted fails consistently.
- Record Outcome fails consistently.
- Followup queue does not update after successful mutation.
- Protected mutation routes appear accessible without expected protection.
