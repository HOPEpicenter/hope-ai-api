# Permanent Visitor Registration
## Residual Development Dependency Security Disposition

Date: 2026-11-24

Status: Proposed disposition.
Release risk approval remains pending.

## 1. Verified security checkpoints

Backend:
2c810361feeae0e7afb4fc10df257f48244d6504

Dashboard:
c301cb94c3a757804587cb7034512b43060a6057

Evidence: HOPE-VISITOR-77 through HOPE-VISITOR-84.

Original dashboard findings: 13.
Original backend findings: 35.

Current dashboard production findings: 0.
Current dashboard development findings: 0.
Current backend production findings: 0.
Current backend development findings: 7.

Combined critical and high findings: 0.

These are npm audit results at the recorded
checkpoints, not a guarantee of complete security.

## 2. Residual development findings

All seven remaining findings were reported as
moderate and verified as development-only in
STEP 84.

| Package | Resolved version |
| --- | --- |
| @azure/monitor-opentelemetry | 1.21.0 |
| @azure/ms-rest-js | 2.7.0 |
| @opentelemetry/instrumentation-http | 0.221.0 |
| applicationinsights | 3.17.0 |
| azurite | 3.38.0 |
| sequelize | 6.37.8 |
| uuid | 8.3.2 |

The reported findings include an HTTP
instrumentation information-disclosure advisory,
a UUID buffer bounds advisory, and associated
transitive dependency findings.

Development-only classification does not eliminate
risk to developer systems or CI environments.

## 3. Proposed engineering disposition

Retain Azurite 3.38.0 for isolated synthetic
acceptance testing.

Do not downgrade Azurite to 2.7.1 merely to
eliminate audit findings.

Do not force incompatible transitive dependency
overrides or suppress npm audit findings.

Do not treat this document as owner approval or
authorization to deploy.

## 4. Required development safeguards

- Bind disposable storage emulators to loopback.
- Use independent temporary storage directories.
- Use synthetic data and disposable credentials.
- Disable Azurite telemetry.
- Keep emulator endpoints inaccessible publicly.
- Never connect acceptance tests to live storage.
- Do not expose production secrets to emulator tests.
- Do not retain sensitive request logs.
- Stop owned test processes after acceptance.
- Remove temporary storage and certificate material.
- Preserve TLS certificate validation.
- Restore process environment settings after tests.

STEP 84 demonstrated isolated local storage,
synthetic registration, enabled TLS validation,
and cleanup of owned acceptance resources.

These results do not independently establish
all network, telemetry, or CI isolation controls.

## 5. Mandatory release gates

Before public registration deployment:

- Reconfirm zero production dependency findings.
- Reconfirm residual findings are development-only.
- Verify deployed runtime artifacts exclude Azurite
  and the affected development-only packages.
- Verify CI acceptance environment isolation.
- Complete broader backend regression tests.
- Complete production builds.
- Complete actual Azure Functions host acceptance.
- Complete permanent registration security controls.
- Obtain explicit approval of any residual risk.

Any new production finding, critical or high
finding, or failed isolation control requires
review before release.

## 6. Review and remediation

Reassess the remaining advisories before release,
when compatible upstream fixes become available,
and at least every 30 days while unresolved.

Prefer supported upstream dependency updates.

Remove this proposed exception when the underlying
findings have been remediated.

Residual risk owner approval: PENDING.
Production deployment approval: NOT GRANTED.

## 7. Scope preservation

The permanent registration form remains unchanged.

Public registration must not require a registered
device, staff login, guest account, event-specific
manual activation, or Sunday-only availability.

The backend remains authoritative for attendance
and follow-up eligibility.

Six-week follow-up creates staff tasks only.

No automated visitor email, text, or phone contact
is authorized.

Production and original staging remain protected.
All deployment and protected-branch changes remain
subject to the existing approval and PR boundaries.
