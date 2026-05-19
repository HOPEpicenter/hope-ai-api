# HOPE Dashboard — Visitor Detail Experience

## Purpose

Define the new Visitor Detail experience for the clean HOPE Dashboard.

This page is the person-centered heart of the platform.

It should help pastors and follow-up teams answer:

> Who is this person, what is their story, where are they in the journey, and how should we care for them next?

---

## Core Principle

The Visitor Detail page is not a data record page.

It is a ministry story page.

The dashboard should present canonical backend truth in a way that feels:

- human,
- pastoral,
- trustworthy,
- action-oriented,
- and easy to understand.

---

## Primary Questions

The page must answer:

1. Who is this person?
2. What happened recently?
3. What is their current care state?
4. Where are they in formation?
5. What follow-up has happened?
6. What should we do next?
7. Can we trust this information?

---

## Layout

Desktop layout:

~~~text
Header
Visitor Hero Summary
Tabs / Sections
Main Story Column
Right Care Panel
~~~

---

## Visitor Hero Summary

The top section should immediately show:

- Display name
- visitorId
- Contact information
- Current stage
- Engagement state
- Follow-up state
- Assigned owner
- Last meaningful activity
- State verified indicator

Example:

~~~text
Angela Morris
New Visitor • Needs care today • Assigned to Sarah J.
Last activity: Worship service check-in, May 18
~~~

---

## Primary Tabs

Recommended tabs:

- Overview
- Story Timeline
- FollowUps
- Formation
- Notes
- Integration

---

## Overview Tab

Purpose:

Give the pastor the full person-centered picture in under 30 seconds.

Sections:

- Current care state
- Pastoral next action
- Recent activity preview
- Formation progress
- Follow-up summary
- Engagement risk / attention state
- Integration connections

The Overview should be the default tab.

---

## Story Timeline Tab

Purpose:

Show the canonical story of the person over time.

Timeline events should be:

- human-readable,
- grouped visually when helpful,
- ordered by canonical backend semantics,
- and easy to scan.

Allowed visual grouping:

- by day,
- by service,
- by formation stage,
- by journey moment.

Not allowed:

- frontend chronology reinterpretation,
- client-side canonical ordering,
- alternate event meanings.

---

## FollowUps Tab

Purpose:

Show care work for this person.

Sections:

- Open follow-up
- Assigned owner
- Last contact
- Last outcome
- Follow-up history
- Suggested next action
- HeartFirst script area

---

## Architectural Guardrails

The Visitor Detail page must consume canonical backend contracts only.

The frontend must not reconstruct lifecycle state, event meaning, engagement state, follow-up state, or formation state.

The backend owns truth.

The dashboard presents that truth with pastoral clarity.

---

## Experience Standard

The experience should feel like:

> A pastor’s heart with an engineer’s brain.

One person.

One story.

One journey.
