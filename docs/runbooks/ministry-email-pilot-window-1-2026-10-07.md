# Ministry email limited production pilot — Window #1

## Window identity

Date: 2026-10-07

Window identifier:

`pilot-window-1-larry-2026-10-07`

Approved real pilot recipient:

Larry Cushnie

Deployed backend checkpoint:

`7c7fe495afa995b5bd1d72cc88677c45a43b2c99`

Canonical corrected delivery:

`prod-pilot1-larry-week6-delivery-v2-2942e5e10e484fbe9357fb1ca1d33d51`

Dispatch request:

`pilot1-larry-c9c080356c544d9eac0d34e56c18e08a`

No recipient email address, administrator identifier, credential, webhook
secret, or provider message ID is recorded in this report.

## Approval

Explicit approval was recorded before production activation for Pilot Window
#1 to send the reviewed email to Larry Cushnie.

The approved delivery content had already passed exact-content preflight before
the window opened.

The approved/stored body SHA-256 was:

`3f1653b286f8f45d83ed5cc1b632b678726cbe8d0a56f04d2d78eef20a4bdaa8`

The corrected body contained ASCII-only text.

The prior corrupted delivery remained permanently `voided` and was not reused
or dispatched.

## Entry state

The window began from the required fail-closed production state:

- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- recipient allowlist empty;
- dispatch recovery false or absent.

The production provider was Resend.

The signed Resend webhook boundary was enabled and configured.

Before activation, the corrected delivery was:

- state `requested`;
- assessment `not_claimed`;
- without a dispatch attempt;
- without a dispatch claim;
- without provider execution;
- without provider evidence;
- `reconciliationRequired=false`;
- `resendAuthorized=false`.

No unresolved canonical delivery was in `dispatching`.

## Recipient eligibility

Immediately before dispatch, the production checks confirmed:

- the canonical visitor existed;
- the canonical recipient address matched the corrected delivery;
- the recipient was the sole exact-address allowlist entry;
- Six-Week contact consent remained true;
- preferred contact method remained email;
- canonical email preference remained `granted`;
- the Week 6 follow-up task remained actionable;
- the exact Six-Week communication intent remained active;
- the communication was not cancelled;
- no MinistryCommunicationOutcome existed;
- the corrected delivery still contained the exact approved content.

The recipient address itself is intentionally not recorded here.

## Activation and live convergence

Production was temporarily configured with:

- `FEATURE_PHASE5_COMMUNICATIONS=true`;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=true`;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=allowlist`;
- exactly one approved recipient address.

Twenty consecutive live Phase-5-enabled data-plane reads succeeded before the
dispatch request was issued.

No old-worker response interrupted the final readiness streak.

## Dispatch

Exactly one dispatch HTTP request was issued.

The request returned HTTP 200.

Canonical delivery inspection immediately after dispatch reported:

- state `provider_accepted`;
- assessment `terminal_recorded`;
- `reconciliationRequired=false`.

A durable dispatch claim existed.

The configured provider was Resend.

The provider message identifier and canonical dispatch attempt identifier were
verified operationally but are intentionally not recorded here.

No automatic or manual dispatch retry occurred.

## Signed provider evidence

Signed Resend provider evidence was persisted and correlated to the exact
canonical delivery and dispatch attempt.

Observed event types:

- `email.sent`;
- `email.delivered`.

The `email.delivered` event was observed before the window was considered
successful.

Provider acceptance and recipient delivery remain separate concepts. The
canonical `provider_accepted` state alone was not used as proof of recipient
delivery.

## Ministry workflow isolation

The MinistryCommunicationEvents history contained two events before dispatch.

The VisitorFollowupEvents history contained eight events before dispatch.

After signed delivery evidence was observed:

- the MinistryCommunicationEvents history was unchanged;
- the VisitorFollowupEvents history was unchanged;
- no MinistryCommunicationOutcome was created;
- no Six-Week event was created;
- provider activity did not complete Week 6.

Provider activity therefore remained isolated from ministry workflow state as
required by the pilot policy.

## Rollback

After the completed dispatch and provider-evidence checks, production was
returned to the required fail-closed state:

- `FEATURE_PHASE5_COMMUNICATIONS=false`;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false`;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- recipient allowlist empty;
- dispatch recovery false or absent.

ARM configuration was verified.

Live data-plane rollback was also verified.

Mixed worker generations were temporarily observed during rollback, so the
disabled-read streak was reset as required.

Six consecutive Phase-5-disabled live reads were ultimately observed.

## Result

Pilot Window #1 completed successfully.

Result summary:

- approved real recipients in this window: 1;
- dispatch requests issued: 1;
- canonical dispatch status: `provider_accepted`;
- reconciliation required: no;
- signed `email.delivered` evidence observed: yes;
- automatic retry: no;
- unexpected ministry workflow mutation: no;
- recipient-policy violation: no;
- fail-closed rollback completed: yes.

Larry Cushnie counts as distinct real pilot recipient #1.

This counts as completed controlled production window #1.

## Pilot progress

Current limited-pilot progress after this window:

- completed controlled production windows: 1 of at least 3;
- distinct explicitly approved real recipients: 1 of at least 5;
- successful recipients with signed `email.delivered` evidence: 1;
- unresolved reconciliation cases: 0;
- unexpected ministry workflow mutations: 0;
- recipient-policy violations: 0.

The limited pilot is not complete.

No wider rollout, standing recipient allowlist, bulk sending, automatic retry,
dispatch recovery, or `MINISTRY_EMAIL_RECIPIENT_POLICY=all` is authorized by
this successful window.

The next real pilot recipient must independently satisfy the same canonical
consent, preference, intent, recipient, content, approval, evidence, isolation,
and rollback requirements.
