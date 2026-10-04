# Ministry email dispatch reconciliation

## Current capability

The internal readMinistryEmailDispatchInspection reader inspects one delivery
by deliveryId. The administrative HTTP inspection endpoint exposes that reader
through GET /api/ministry-email-deliveries/{deliveryId}/dispatch-inspection.

The HTTP boundary requires the canonical administrative Staff actor check before
inspection. The reader itself remains authorization-agnostic so internal callers
must establish their own approved authorization boundary.

This slice introduces no recovery write, claim reset, provider lookup, retry,
reclaim, concrete sending implementation, provider credentials, or send action.

Inspection remains available while sending flags are off. It reports an explicit
allowlist of lifecycle metadata. It omits subject, body, recipient email, staff
and visitor identities, eligibility data, and raw failure or exception messages.
Provider message IDs are internal operational metadata; restrict their access.

## Interpret the snapshot

- requested / not_claimed: no durable claim is recorded in this snapshot.
  Inspection does not authorize a send.
- dispatching / execution_unresolved: an execution was durably claimed.
  Provider invocation or acceptance cannot be inferred from the row alone.
- provider_accepted / terminal_recorded: recorded provider acceptance.
  This does not prove delivery to the recipient.
- failed / terminal_recorded: a terminal provider failure is recorded.
  This does not authorize another attempt.
- invalid or unavailable inspection: do not infer state or resend safety.

The snapshot can become stale immediately. Claim age is informational only.
An old claim is not an expired lease. A future claim timestamp yields unknown age.

## Procedure for unresolved execution

1. Record deliveryId, dispatchAttemptId, claim timestamp and inspection timestamp
   in the approved restricted incident record. Do not copy message contents,
   recipient email, credentials, authorization headers or raw provider errors.
2. Keep this delivery blocked from automatic resend, reset and reclaim.
3. Gather trustworthy execution/provider evidence for the exact attempt.
   Database age, missing logs, or an absent provider search result alone are
   insufficient proof that no external send occurred.
4. Escalate for an explicitly authorized, audited recovery decision.
   There is currently no manual recovery command in this slice.
5. Reinspect before any future approved resolution. That resolution must verify
   attempt identity, concurrency, evidence and actor authority independently.

Do not manually edit Azure Table rows or invoke the provider-result persistence
service as an operator recovery shortcut. That service is a worker persistence
boundary and does not verify recovery evidence or administrative authority.

## Remaining activation gate

Before real sending, implement and validate evidence-backed resolution with
operator audit, concurrency protection and replay semantics. Ambiguous evidence
must leave the delivery unresolved. Recovery mutation, provider integration,
configuration, safe observability and controlled acceptance remain separate gates.

No resolution should mutate MinistryCommunicationOutcome or Six-Week state
merely because a provider accepted a message.

## Internal evidence-backed recovery foundation

Recovery resolution is internal only. There is no recovery HTTP command in this
slice.

A resolution requires affirmative normalized evidence bound to the exact
deliveryId and dispatchAttemptId. Absence of provider evidence, claim age,
missing logs, recipient reports, or a provider search with no result never
authorizes resolution or resend.

Accepted evidence categories are:

- affirmative provider acceptance evidence from a captured send response,
  verified provider event, or verified provider activity record;
- a synchronous captured provider rejection response with a normalized failure
  code.

Provider events that occur after API acceptance, including later delivery
failures, still prove provider acceptance and must not be reclassified as a
synchronous provider rejection.

Successful recovery atomically commits the ETag-protected delivery terminal
transition and an immutable recovery audit entity in the same
MinistryEmailDeliveries table partition. A stale delivery version or recovery
audit conflict commits neither operation.

resolutionId is the replay identity. An exact replay returns the prior recovery
result without another mutation. Reusing a resolutionId with different evidence,
actor attribution, attempt identity, timestamps, or decision is a conflict.

Recovery performs no provider invocation and cannot authorize resend. It does
not mutate MinistryCommunicationOutcome or Six-Week state.

The future recovery HTTP boundary must independently establish canonical
administrative actor authorization before supplying actorId to the internal
recovery service.