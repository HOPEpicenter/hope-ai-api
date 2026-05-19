# HOPE Dashboard — Component System

## Purpose

Define the reusable component architecture and UI primitives for the new HOPE Dashboard.

These components should support:
- pastoral workflows,
- operational clarity,
- canonical backend ownership,
- responsive layouts,
- and long-term dashboard consistency.

The component system should feel:

> Warm, trustworthy, calm, pastoral, and operationally clear.

---

# Core Component Philosophy

## 1. Components Serve People First

Every component should reinforce:
- clarity,
- care,
- trust,
- readability,
- and action.

The dashboard should never feel like:
- a cold CRM,
- a ticketing console,
- or a generic enterprise admin panel.

---

## 2. Backend Owns Meaning

Components present backend-owned truth.

Components must NOT:
- invent canonical state,
- reinterpret lifecycle semantics,
- derive backend meaning,
- or override canonical ordering.

---

## 3. Calm Operational Clarity

Use:
- spacing,
- hierarchy,
- typography,
- grouping,
- and soft emphasis.

Avoid:
- visual chaos,
- over-alerting,
- aggressive warning colors,
- and noisy dashboards.

---

# Global Layout Primitives

## AppShell

Primary application wrapper.

Responsibilities:
- header placement,
- left navigation,
- responsive layout,
- right-side panels,
- content containers.

Structure:

```text
<AppShell>
  <Header />
  <Sidebar />
  <MainContent />
  <RightPanel />
</AppShell>
```

---

## PageContainer



Provides:

max-width,
responsive padding,
vertical rhythm,
page spacing consistency.

---

## SectionContainer


Reusable section wrapper.

Used for:

queue sections,
snapshot sections,
metrics groups,
guidance panels.

Should support:

title,
subtitle,
actions,
loading state,
empty state.
Typography Tokens
DisplayTitle

Used for:

page identity,
visitor names,
large headings.

Tone:

warm,
readable,
confident.
SectionTitle

Used for:

queue headers,
snapshot groups,
guidance sections.
BodyText

Default readable content text.

MetadataText

Used for:

timestamps,
secondary labels,
IDs,
metadata.
PillText

Used inside:

status pills,
urgency badges,
compact indicators.
Color Token System
HopeGreen

Primary action and healthy state.

Usage:

active navigation,
primary buttons,
verified states,
positive actions.
HopeYellow

Encouragement and hopeful progression.

Usage:

milestones,
highlights,
celebrations,
formation progress.
WarmNeutral

Primary background/surface system.

Usage:

cards,
layouts,
panels,
queues.
AttentionAmber

Needs attention but not panic.

Usage:

overdue,
delayed,
waiting too long.
CareRedMuted

High urgency requiring care.

Usage:

escalation,
severe risk,
important attention states.

Avoid aggressive error aesthetics.

Card System
BaseCard

Foundation for:

queue cards,
visitor cards,
guidance cards,
metrics cards.

Properties:

soft radius,
subtle shadow,
warm background,
strong spacing.
QueueCard

Purpose:
represent a person needing care.

Sections:

avatar,
identity,
reason,
engagement summary,
owner,
urgency,
actions.

Primary action:

Care for this person

Secondary:

Text
Call
Email
Assign
Snooze
VisitorCard

Compact visitor summary component.

Used in:

search,
directory,
related people,
quick previews.
MetricsCard

Used for:

Needs care today,
Overdue,
Waiting for owner,
Cared for today.

Behavior:

clickable filters,
soft emphasis,
compact operational insight.
Snapshot System
VisitorSnapshotPanel

Persistent right-side panel.

Purpose:
keep the person visible while operators work.

Sections:

Identity
Care State
Engagement
Formation
Integration
Trust / Sync
SnapshotSection

Reusable section wrapper inside snapshot panel.

Supports:

title,
metadata,
compact timelines,
badges,
actions.
Guidance Components
PastoralGuidanceCard

One of the defining HOPE components.

Purpose:
translate backend intelligence into pastoral action.

Sections:

Pastoral Intent
Human Touch Prompt
Why This Matters
Suggested Script
Action Buttons
HeartFirstScriptBox

Editable suggested message area.

Supports:

copy,
edit,
send,
regenerate later.

Must always preserve human control.

Timeline Components
TimelineEventCard

Purpose:
human-readable engagement history.

Should show:

event type,
summary,
timestamp,
related context,
pastoral relevance if available.
TimelineGroup

Optional visual grouping.

Allowed:

same-day grouping,
service grouping,
formation grouping.

Not allowed:

chronology reinterpretation.
Status System
StatusPill

Used for:

needs care,
cared for,
overdue,
assigned,
verified,
delayed.

Tone:
clear but calm.

SyncHealthBanner

Shows:

synced,
delayed,
degraded,
verifying.

Avoid:

panic-inducing language,
technical jargon.
Action System
PrimaryActionButton

Main action:

Care for this person

Should visually stand out calmly.

SecondaryActionButton

Used for:

Text
Call
Email
Snooze
Assign
ActionBar

Reusable horizontal action layout.

Supports:

responsive wrapping,
compact mode,
mobile stacking.
Empty State System
EmptyState

Tone:
hopeful and calm.

Example:

Everyone is cared for right now.

Should optionally include:

illustration later,
suggested next actions,
quick navigation.
Loading State System
LoadingPanel

Should feel calm and intentional.

Example:

Gathering today’s care focus…

Avoid:

spinner-only experiences,
abrupt layout shifts.
Responsive Rules
Desktop

Three-column layout:

nav,
main cockpit,
visitor snapshot.
Tablet

Collapsible navigation.
Stacked secondary panels.

Mobile

Priority order:

queue,
snapshot,
guidance.

Use:

drawers,
bottom sheets,
large tap targets.
Accessibility Rules

Requirements:

keyboard navigation,
screen-reader labels,
reduced motion support,
strong contrast,
focus visibility,
large touch targets.
Canonical Backend Boundaries

Components may consume:

canonical dashboard contracts,
canonical visitor summaries,
canonical narratives,
canonical formation profiles,
canonical timeline previews.

Components must not:

derive lifecycle state,
reinterpret follow-up chronology,
override canonical ordering,
rebuild business semantics in the UI.
Long-Term Goal

The component system should allow the HOPE Dashboard to grow into:

pastoral intelligence,
formation tracking,
unified visitor story systems,
operational care workflows,
and multi-campus ministry tooling

without losing:

warmth,
clarity,
trust,
and backend-governed consistency.
Final Principle

Every component should help answer:

How do we help people care for people better?rnrnrn

