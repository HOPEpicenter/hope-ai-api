# HOPE Dashboard — Today View System Design

## Purpose

Define the reusable UI system and layout structure for the new HOPE Dashboard Today View.

This is the flagship screen of the platform.

The design goal is:

> Calm pastoral clarity with strong operational trust.

The screen should help pastors and follow-up teams quickly understand:
- who needs care,
- why they need care,
- what happened recently,
- and what the next best action is.

---

# Core UX Principles

## 1. People Before Data

The screen should feel person-centered, not ticket-centered.

Good:
- Needs care
- Personal touch
- Last conversation
- Encouragement

Avoid:
- Ticket
- SLA
- Queue object
- Lifecycle failure

---

## 2. Backend Truth, Thin UI

The dashboard consumes canonical backend contracts.

The UI:
- presents,
- filters,
- groups,
- highlights,
- and guides.

The UI must NOT:
- redefine state,
- derive canonical meaning,
- reinterpret follow-up chronology,
- or rebuild lifecycle semantics.

---

## 3. Calm Urgency

Urgent items should stand out without making the product stressful.

Avoid:
- aggressive red overload,
- flashing indicators,
- dense enterprise dashboards.

Prefer:
- soft escalation colors,
- strong typography hierarchy,
- whitespace,
- readable cards,
- clear next actions.

---

# Layout Grid

Desktop target:
- 1440px optimized
- responsive down to tablet/mobile

## Main Layout

```text
┌────────────────────────────────────────────────────────────┐
│ Header                                                     │
├─────────────┬─────────────────────────────┬───────────────┤
│ Left Nav    │ Main Cockpit                │ Visitor Panel │
│             │                             │               │
└─────────────┴─────────────────────────────┴───────────────┘

## Width Targets
Left Nav: 240px
Main Cockpit: flexible
Visitor Panel: 360px

---

# Header System
Left Area
HOPE logo
HOPE Dashboard label
Optional environment badge later
Center Area

Universal search:

name
visitorId
phone
email

Placeholder:

Search people, visitor ID, phone, or email

Right Area
Campus filter
Date range
Sync health
User profile
Role badge

---

# Navigation System
Navigation Tone

Warm and ministry-oriented.

Avoid:

admin-console feel
cold enterprise styling
Primary Navigation
Today
FollowUps
Visitors
Timeline
Formation
Intelligence
Reports
Settings
Active Navigation

Use HOPE green accent.

---

# Color Direction
Primary

HOPE Green:

trust
growth
action
healthy state
Secondary

Warm neutrals:

calm backgrounds
readable surfaces
Accent

HOPE yellow:

hopeful highlights
positive reinforcement
milestone celebration
Warning

Soft amber:

overdue
stalled
delayed care
Critical

Muted warm red:

escalation
high attention

Avoid:

bright harsh reds
cyber/neon aesthetics
aggressive alert styling

---

# Typography Direction
Tone

Readable.
Warm.
Clear.
Human.

Hierarchy
Large Headers

Used for:

Today’s Care Focus
Visitor name
Main page identity
Medium Headers

Used for:

Queue sections
Snapshot sections
Guidance cards
Compact Labels

Used for:

pills
metadata
timestamps
secondary context

---

# Card System
Primary Queue Card

Purpose:
display people needing care.

Structure:

avatar
identity
reason
engagement summary
owner
urgency
actions
Actions

Primary:

Care for this person

Secondary:

Text
Call
Email
Snooze
Assign

---

# Visitor Snapshot Panel

Purpose:
keep the person visible while operators work.

Sections:

Identity
Care state
Engagement
Formation
Integration
Trust/sync

The snapshot panel should feel:

stable,
trustworthy,
grounded,
pastoral.

---

# Heart-First Guidance Panel

This is a major differentiator of HOPE.

Purpose:
translate backend intelligence into pastoral action.

Sections:

Pastoral Intent
Human Touch Prompt
Why This Matters
Suggested Script
Action Buttons

Important:
the system should support human care, not replace it.

---

# Queue Behavior

Backend owns canonical ordering.

Frontend may:

filter,
visually group,
change density,
sort visually when safe.

Frontend must not:

override canonical meaning,
reinterpret follow-up resolution,
recompute canonical chronology.

---

# State Indicators
Healthy
green
verified
synced
Delayed
amber
waiting
delayed
Degraded
muted warning
latest verified state shown

Avoid:

panic-inducing system language

---

# Empty States
Empty Queue

Everyone is cared for right now.

Loading

Gathering today’s care focus…

Degraded

Some care data may be delayed.
Showing latest verified backend state.

---

# Mobile Strategy

Priority order:

Queue
Snapshot
Guidance

Mobile interaction:

stacked layout
bottom-sheet actions
large tap targets
quick contact actions

---

# Accessibility

Requirements:

strong contrast
keyboard navigation
screen reader labels
reduced motion support
large touch targets

---

# Future Extensions

Future-ready support for:

AI-assisted summaries
voice notes
smart reminders
multi-campus rollups
collaboration
realtime updates

without changing canonical backend ownership.

---

# Design Goal

The Today View should feel like:

A calm trusted ministry cockpit that helps people care for people.

Not:

a ticketing system,
a CRM queue,
or an enterprise operations console.

