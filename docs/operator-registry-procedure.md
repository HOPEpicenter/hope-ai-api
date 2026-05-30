# Operator Registry Procedure

## Purpose

This procedure explains how to update the canonical operator registry during the pilot.

## Registry Location

The operator registry is defined in:

`src/services/operators/operatorIdentity.ts`

The canonical export is:

`OPERATOR_REGISTRY`

## Current Behavior

Known operators are used for:

- operator display-name resolution
- known operator validation
- Formation V1 followup mutation attribution
- future governance and authorization work

## Add an Operator

1. Create a feature branch from main.
2. Edit `src/services/operators/operatorIdentity.ts`.
3. Add a new entry to `OPERATOR_REGISTRY`.
4. Use a stable operatorId.
5. Use a clear display name.
6. Run validation.
7. Open a PR.
8. Merge only after CI is green and staging deployment succeeds.

## Example

```ts
{
  operatorId: "ops-user-3",
  displayName: "Care Team"
}
```

## Remove an Operator

Before removal:

1. Confirm the operator should no longer perform pilot actions.
2. Confirm no active workflow depends on that operator ID.
3. Prefer disabling access outside the application first.
4. Remove the registry entry in a PR.
5. Validate and deploy.

## Validation

```powershell
npm test
npm run build
```

## Important Notes

- Operator IDs are attribution/governance identifiers.
- This is not full RBAC.
- This is not a user-management system.
- Changes must go through PR, CI, staging deployment, and verification.
