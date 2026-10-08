# Ministry communication ledger production rollout - 2026-10-08

## Result

The staff-recorded Ministry Communication ledger was separated from Phase 5
email-delivery activation, accepted in isolated staging, and then enabled in
production.

The rollout completed successfully.

The ledger now supports normal staff recording of communication permission,
outreach intent, outcomes, and cancellation while outbound ministry-email
delivery remains fail-closed.

No email-send authorization is granted by this rollout.

## Code checkpoints

Backend production checkpoint:

`deb76316672549ca59b5d71bc351637932c0d46e`

Backend change:

- PR #1281: `feat: separate ministry communication ledger gate`
- added `FEATURE_MINISTRY_COMMUNICATION_LEDGER`;
- retained backward compatibility with the existing Phase 5 communications
  gate;
- retained the independent Phase 5 requirement for email-delivery creation.

Dashboard production checkpoint:

`876ccddde3bf25ea9be7327af2bd22192732e2a5`

Dashboard changes:

- PR #213: `feat: separate ministry communication ledger gate`
- PR #214: `chore: wire ministry communication ledger build flag`

The Person 360 Ministry Communication panel can therefore be enabled
independently from Phase 5 email delivery.

## Fixed staging promotion

The reviewed dashboard changes were promoted to the fixed staging branch by
PR #215.

Staging merge checkpoint:

`15e9159b34de8783fe767ddc679e1b94b4489076`

The promotion preserved the isolated staging backend configuration.

The initial staging deployment completed successfully before activation.

## Staging ledger-only activation

Staging was activated with:

- `FEATURE_MINISTRY_COMMUNICATION_LEDGER=true`;
- staging dashboard ledger build variable enabled;
- `FEATURE_PHASE5_COMMUNICATIONS=false` or absent;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false` or absent;
- dispatch recovery false or absent;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- recipient allowlist empty.

Live backend convergence was verified with six consecutive
ledger-enabled reads.

The staging Person 360 page then displayed the Ministry Communication panel
with the `Staff-recorded only` explanation.

## Staging ledger acceptance

A synthetic staging fixture with an existing granted email preference and
existing communication history was used.

The acceptance intentionally preserved the existing preference and history.

One new uniquely identified synthetic communication intent was:

1. recorded through the ledger boundary;
2. read back through the canonical projection;
3. verified as a planned email follow-up in `person_360` context;
4. used for a negative email-delivery control;
5. cancelled after the negative-control proof.

The earlier synthetic communication history remained unchanged.

The existing email preference remained `granted`.

No outcome was invented for the cancelled acceptance record.

## Staging delivery negative control

While the ledger was enabled, the staging email-delivery request boundary was
called with Phase 5 still disabled.

The request was rejected with:

- HTTP 503;
- code `PHASE5_COMMUNICATIONS_DISABLED`.

Dispatch inspection for the synthetic negative-control delivery ID returned:

- HTTP 404;
- code `DELIVERY_NOT_FOUND`.

This proved that ledger activity did not make email delivery available and
that no delivery record was persisted.

No provider execution occurred.

## Production preflight

Before production activation, the following were verified:

- exact production `Microsoft.Web/sites` resource;
- production hostname;
- backend `main` at the expected PR #1281 checkpoint;
- dashboard `main` at the expected PR #214 checkpoint;
- production dashboard deployed from the expected dashboard SHA;
- production ledger disabled;
- production dashboard ledger disabled;
- Phase 5 disabled;
- provider sending disabled;
- dispatch recovery disabled or absent;
- recipient policy `deny_all`;
- recipient allowlist empty.

Six consecutive live production reads returned the expected
ledger-disabled boundary before activation.

No production configuration or ministry data was changed during preflight.

## Production backend activation

Production was changed only to enable:

`FEATURE_MINISTRY_COMMUNICATION_LEDGER=true`

All email-delivery controls remained fail-closed.

Flex Consumption worker convergence temporarily included old workers after
the ARM setting changed.

The readiness streak was reset whenever an old worker was observed.

Ten consecutive ledger-enabled live reads were ultimately observed before the
rollout advanced.

The convergence probes caused no ministry-data mutation.

## Production delivery negative control

After the production ledger became live, an authorized negative-control email
delivery request was issued.

The request was rejected with:

- HTTP 503;
- code `PHASE5_COMMUNICATIONS_DISABLED`.

Dispatch inspection confirmed that no production email-delivery record had
been persisted for the negative control.

The provider boundary was never reached.

## Production dashboard activation

The production dashboard ledger build variable was enabled while the accepted
staging ledger variable remained enabled.

Production dashboard workflow run:

`37710515967`

The production build rerun completed successfully on attempt 2.

The deployed dashboard SHA remained:

`876ccddde3bf25ea9be7327af2bd22192732e2a5`

No new application code was introduced during activation.

## Final production safety state

After activation, production verified:

- `FEATURE_MINISTRY_COMMUNICATION_LEDGER=true`;
- production dashboard ledger enabled;
- staging dashboard ledger enabled;
- `FEATURE_PHASE5_COMMUNICATIONS=false` or absent;
- `FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false` or absent;
- dispatch recovery false or absent;
- `MINISTRY_EMAIL_RECIPIENT_POLICY=deny_all`;
- recipient allowlist empty.

A final six consecutive live reads confirmed that the production ledger
remained enabled and stable.

## Production visual acceptance

Production Person 360 displayed:

- `Ministry Communication`;
- `Record permission and staff outreach`;
- the `Staff-recorded only` notice;
- independent Email and Phone call permission states;
- the staff outreach form;
- communication history.

The inspected real production record had existing permission states of
`Unknown`.

The UI correctly prevented creation of an outreach record until granted
permission is recorded for the selected channel.

No permission, outreach intent, outcome, cancellation, visitor field, care
state, Six-Week state, note, or other real ministry data was changed for the
visual acceptance.

## Operational meaning

Staff may now use the Ministry Communication ledger as part of normal ministry
work.

Staff should record permission only when permission has actually been given,
denied, withdrawn, or otherwise legitimately established.

Staff should create communication intents only for genuine ministry outreach.

Staff should record communication outcomes only when those outcomes actually
occur.

Do not create or modify communication records merely to manufacture
eligibility for an email pilot.

The backend remains authoritative for permission, intent, outcome, and
delivery eligibility.

## Email-delivery isolation

This rollout does not authorize routine or automatic ministry-email sending.

The following remain disabled or fail-closed:

- Phase 5 email-delivery creation;
- provider sending;
- dispatch recovery;
- unrestricted recipient authorization;
- standing recipient allowlists;
- automatic email dispatch;
- automatic retry.

`MINISTRY_EMAIL_RECIPIENT_POLICY=all` remains unauthorized.

Provider activity must continue to remain isolated from ministry workflow
outcomes and Six-Week task completion.

## Limited email pilot status

The communication-ledger rollout does not count as an additional controlled
email-send window and does not count as an additional real pilot recipient.

The limited email pilot therefore remains at:

- completed controlled production windows: 1 of at least 3;
- distinct explicitly approved real recipients: 1 of at least 5;
- successful recipients with signed `email.delivered` evidence: 1;
- unresolved reconciliation cases: 0;
- unexpected ministry workflow mutations: 0;
- recipient-policy violations: 0.

The limited email pilot remains incomplete.

Future real pilot recipients must become eligible through legitimate ministry
activity and independently satisfy the existing consent, preference, intent,
recipient, content, approval, provider-evidence, workflow-isolation, and
rollback requirements.

## Rollout conclusion

The Ministry Communication ledger is now available for normal staff-recorded
production ministry activity independently of email delivery.

The architecture demonstrated the intended separation:

`staff recordkeeping != email delivery authorization`

Production remains fail-closed for outbound ministry email until a separately
approved pilot window or later rollout explicitly changes those controls.
