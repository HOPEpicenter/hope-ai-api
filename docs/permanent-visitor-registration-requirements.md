# HOPE Ministry OS
## Permanent Visitor Registration Requirements

Baseline date: 2026-11-24

Status: Confirmed operating requirements.
Exact final November 24 visual design reconciliation remains pending.

### Mission

Provide permanent visitor registration integrated into HOPE Ministry OS.
Support ministry care through staff-led six-week follow-up.

### Permanent availability

- One reusable public registration URL and QR code.
- Available every day of the week.
- Sunday services, weekday services and special events.
- Unscheduled visits must also be accepted.
- No manual activation before an event.
- No owner activation identity required for routine admission.
- Initial deployment remains subject to approval.
- Emergency administrative shutdown remains available.

### Device independence

- Church iPad and personal smartphones use the same public form.
- Tablets and other browsers are supported.
- No device registration.
- No device pairing.
- No visitor account or staff sign-in requirement.
- No special admission privileges for the church iPad.

### Event association

- Backend determines the current Eastern calendar date.
- Associate visits with an applicable scheduled event.
- Offer event selection where multiple events apply.
- Support a server-generated General Visit when no event applies.
- Never trust a browser-supplied date as authoritative.
- Missing event schedules must not block visitor registration.

### Registration form

Preserve the established HOPE branding and approved form design.

Confirmed field requirements:
- Visitor name.
- Email and phone, with at least one contact method.
- First-time or returning visitor.
- Individual and family registration.
- Accompanying children and guardian declaration.
- Optional church-home status.
- Ministry interests.
- Optional invited-by information.
- Explicit permission for personal staff follow-up.

Reference source:
HOPEpicenter/hope-dashboard-next
Commit: 00526bc35cf02b27905e4618b06eec49542c1018
Path: public/visit/index.html

Source-backed interest options:
- Church events
- Prayer
- Small groups
- Growing in faith

Do not invent or silently remove approved form choices.
Recover the final November 24 design before UI completion.
Additional adult family-member handling remains to be reconciled.

### Family attendance

- Record attendance of accompanying children.
- Guardian declaration required.
- Collect only approved minimum child information.
- No childcare, drop-off or pickup authorization.

### Registration security

- Automatic short-lived public submission sessions.
- No manual session issuance by the owner.
- Server-controlled session and admission authority.
- Shared capacity protection for all public devices.
- Durable submission replay and conflict protection.
- Atomic create-only reservation transactions.
- Safe retry following uncertain storage outcomes.
- Fail closed on unknown authorization or storage failures.
- No backend credentials exposed to the browser.
- No raw visitor information in quota records.

### Canonical persistence

- Backend owns visitor validation and persistence.
- Dashboard remains a thin client.
- Connect to canonical visitor and People records.
- Recognize returning visitors safely.
- Prevent duplicate registrations and unnecessary People records.
- Do not silently discard submitted registration information.
- Confirm registration only after durable successful persistence.
- Clear previous guest information on shared devices.

### Ministry follow-up

- Integrate with People, Person 360 and Today.
- Preserve attendance and ministry care history.
- Respect the visitor's follow-up permission.
- Use staff tasks for permitted six-week follow-up.
- No automated visitor emails, text messages or phone calls.

### Engineering guardrails

- PowerShell 7.
- Backend-first.
- Minimal targeted changes.
- Feature flags default off before controlled release.
- Protected main and PR-only integration.
- Preserve production and original staging.
- Preserve the temporary Friends and Family worktrees.
- No deployment or live activation without approval.
- No repeated completed tests unless affected by a change.

### Change control

This document is the durable operating requirements reference.
Do not introduce device pairing, routine manual activation or
Sunday-only availability into the permanent registration path.

Record approved requirement changes explicitly.
Do not treat an assistant-generated reconstruction as an
owner-approved visual design.

### Engineering checkpoint

Backend branch: feat/permanent-visitor-checkin
Checkpoint before this document:
2c0e1d113d460e6cd972ec33aeb586e67a584a8d

Cumulative focused tests passed: 69

Next:
Reconcile event admission and session issuance with permanent
automatic public availability. Preserve useful durable storage,
replay protection and concurrency foundations.
