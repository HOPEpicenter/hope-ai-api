# Resend staging acceptance

## Purpose

This runbook controls staging acceptance of the Resend ministry-email provider.

Acceptance must preserve the existing communications safety model:

- backend remains authoritative;
- provider acceptance is not recipient delivery;
- durable dispatch claims are not retry leases;
- ambiguous execution never authorizes resend;
- provider evidence must correlate to the exact delivery and dispatch attempt;
- MinistryCommunicationOutcome is not mutated merely because an email was sent;
- Six-Week state is not mutated merely because an email was sent;
- production activation is a separate decision.

The companion script is:

`scripts/assert-resend-staging-readiness.ps1`

The script is read-only. It never changes Azure settings, creates Resend
resources, invokes an authenticated ministry-email command, or sends email.

## Readiness states

### Dormant

Expected before provider provisioning is complete:

- FEATURE_PHASE5_COMMUNICATIONS is false or absent;
- FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING is false or absent;
- FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK is false or absent;
- FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY is false or absent.

Run:

```pwsh
pwsh -NoProfile -File scripts/assert-resend-staging-readiness.ps1 `
  -ExpectedState Dormant
```

### Prepared

Use only after the staging Resend domain is verified and provider credentials
and webhook signing configuration have been explicitly approved.

Expected configuration:

- MINISTRY_EMAIL_PROVIDER=resend
- RESEND_API_KEY is configured
- RESEND_FROM uses mail-staging.hopepicenter.org
- RESEND_EVENT_WEBHOOK_SIGNING_SECRET is configured
- FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK=true
- FEATURE_PHASE5_COMMUNICATIONS=false
- FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=false or absent
- FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY=false or absent

This state allows webhook authentication/evidence acceptance to be validated
without allowing an email dispatch.

Run:

```pwsh
pwsh -NoProfile -File scripts/assert-resend-staging-readiness.ps1 `
  -ExpectedState Prepared
```

### Activated

This is a temporary controlled staging acceptance window.

Expected configuration:

- all Prepared prerequisites remain satisfied;
- FEATURE_PHASE5_COMMUNICATIONS=true;
- FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING=true;
- FEATURE_MINISTRY_EMAIL_EVENT_WEBHOOK=true;
- FEATURE_MINISTRY_EMAIL_DISPATCH_RECOVERY remains false or absent.

Run the readiness script before creating or dispatching a test delivery:

```pwsh
pwsh -NoProfile -File scripts/assert-resend-staging-readiness.ps1 `
  -ExpectedState Activated
```

The readiness script still does not send email.

## Provider provisioning gate

Do not provision the staging sender credential or webhook until
mail-staging.hopepicenter.org reports verified in Resend.

The staging API key must be dedicated to staging, restricted to sending, and
restricted to the staging sending domain when the provider supports that
restriction.

The staging webhook endpoint is:

`https://hope-ai-api-staging.azurewebsites.net/api/ministry-email/webhooks/resend/events`

Subscribe only to provider events supported by the backend normalization
contract:

- email.sent
- email.delivered
- email.delivery_delayed
- email.bounced
- email.complained
- email.failed

Do not copy API keys or webhook signing secrets into source files, shell
history, PR descriptions, logs, screenshots, or acceptance evidence.

## Synthetic acceptance-data gate

No real ministry recipient may be used for provider acceptance testing.

Before entering Activated state, identify an explicitly synthetic staging
visitor and communication that satisfy the canonical backend eligibility rules,
including:

- a test-controlled email address;
- required Six-Week communication context;
- contactConsent=true;
- emailPreference=granted;
- canonical communication state eligible for the email request;
- an active configured administrative Staff actor.

Record only opaque test identifiers in acceptance evidence. Do not record the
recipient address, subject, body, credentials, authorization headers, or
webhook signing secret.

## Controlled acceptance sequence

1. Confirm the Resend staging domain is verified.
2. Confirm the dedicated staging sender credential exists.
3. Confirm the Resend staging webhook exists with the approved event allowlist.
4. Configure staging provider prerequisites while send flags remain off.
5. Run the Prepared readiness assertion.
6. Verify unsigned webhook requests fail closed.
7. Identify one synthetic eligible visitor and communication.
8. Explicitly authorize the temporary staging activation window.
9. Enable only FEATURE_PHASE5_COMMUNICATIONS and
   FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING for the window.
10. Run the Activated readiness assertion.
11. Create one delivery through POST /api/ministry-email-deliveries using the
    canonical administrative boundary.
12. Verify the delivery is requested before dispatch.
13. Inspect the delivery through
    GET /api/ministry-email-deliveries/{deliveryId}/dispatch-inspection.
14. Dispatch that one delivery through
    POST /api/ministry-email-deliveries/{deliveryId}/dispatch.
15. Do not retry if execution becomes uncertain or remains dispatching.
16. Confirm provider acceptance separately from recipient delivery.
17. Confirm the durable dispatch attempt carries the opaque correlation values
    hope_delivery_id and hope_dispatch_attempt_id.
18. Confirm a signed supported Resend provider event is accepted and persisted.
19. Confirm exact provider-event replay is idempotent.
20. Confirm no MinistryCommunicationOutcome or Six-Week state was changed by
    provider acceptance alone.
21. Restore the staging send flags to disabled immediately after acceptance.
22. Run the Dormant or Prepared readiness assertion matching the approved
    post-test configuration.

## Mandatory rollback

The acceptance window ends by disabling:

- FEATURE_MINISTRY_EMAIL_PROVIDER_SENDING
- FEATURE_PHASE5_COMMUNICATIONS

Do not remove provider evidence, delivery records, dispatch claims, or audit
evidence as part of rollback.

Do not manually edit Azure Table rows.

If the delivery remains dispatching or provider execution is uncertain, stop.
Use the canonical dispatch inspection and evidence-backed reconciliation path.
Do not reclaim, retry, reset, or send a replacement message merely because the
provider result is not immediately visible.

## Production gate

Successful staging acceptance does not authorize production sending.

Production requires a separate review of:

- domain and sender identity;
- production-specific provider credential;
- production webhook and signing secret;
- production feature flags;
- production recipient safeguards;
- observability and audit evidence;
- rollback procedure;
- explicit production activation approval.

Before any production activation, follow:

`docs/runbooks/resend-production-readiness.md`

The initial production rollout must use `MINISTRY_EMAIL_RECIPIENT_POLICY=allowlist` with exact approved recipient addresses. Staging acceptance does not authorize the `all` recipient policy.
