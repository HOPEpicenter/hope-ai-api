# Pilot Readiness Review



## Purpose



This document evaluates whether the HOPE platform is ready for a controlled pilot with real operators.



The core readiness question:



> Can a real operator safely use the system for the current pilot workflow?



## Current Recommendation



\*\*Pilot readiness status: Conditional Go\*\*



The backend foundation, followup lifecycle, Today cockpit workflow, operator attribution, and operational surface guardrails are strong enough for a controlled pilot.



The remaining work is operational rather than architectural.



## 1. Backend Readiness



### Green



\- Canonical Formation event model is established.

\- Formation replay and reconciliation are hardened.

\- Projection rebuild and repair semantics are established.

\- Followup lifecycle semantics are validated.

\- Unified visitor story/detail reading is established.

\- OPS followups read model is stable and regression-covered.

\- Runtime route inventory exists and is guard-protected.

\- CI and staging deploy workflow are consistently green.



### Yellow



\- Production/staging ops-preview latency remains elevated.

\- Audit logging is not yet a full standalone system.

\- Operator onboarding is registry-based but still code/config driven.



### Red / Deferred



\- Full RBAC/auth system.

\- Realtime sync.

\- Autonomous orchestration.

\- AI recommendation UI.



## 2. Operator Workflow Readiness



### Green



The validated operator workflow is:



```text

Ready Care

&#x20; -> Open Visitor

&#x20; -> Mark Contacted

&#x20; -> Record Outcome

&#x20; -> Resolved



Current strengths:



Today cockpit is the primary operator surface.

Ready Care cards are backend-authoritative.

Visitor detail workflow is validated.

Queue reprioritization is validated.

Contact and outcome flow is validated.

Dashboard access gate and token protection are active.

Yellow

Pilot operators still need a short workflow guide.

Edge-case handling should be documented:

duplicate visitor

wrong outcome selected

followup assigned to wrong operator

staging/API latency

Red / Deferred

Major dashboard redesign.

Realtime operator collaboration.

Global dashboard state framework.

3\. Security and Governance

Green

Protected API routes enforce HOPE\_API\_KEY.

Runtime route inventory is documented.

Route inventory is checked by guard scripts.

Formation V1 followup mutations require source.actorId.

Operator actors must be known registry operators.

Operator attribution is persisted through:

Formation event source

Formation profile lastActorId

OPS followups read model lastActorId

Operator identity resolution is centralized.

Operator registry is formalized.

Yellow

API key is still coarse-grained.

No full per-user auth/RBAC yet.

No standalone audit-log table yet.

Operator onboarding/offboarding is not yet a runtime workflow.

Red / Deferred

JWT-based user identity.

Role-based permission enforcement.

Fine-grained mutation authorization.

4\. Operational Procedures

Green

PR-only workflow is established.

CI is consistently green.

Staging deploy is consistently green.

Regression and smoke suite cover core lifecycle behavior.

Runtime route inventory gives a baseline for operational review.

Yellow



Before pilot, create short runbooks for:



how to start/stop pilot day

how to verify staging health

how to recover from failed deploy

how to handle slow ops-preview responses

how to add/remove an operator from the registry

how to record known incidents during pilot

Red / Deferred

Automated incident response.

Full observability dashboard.

Production-grade SLO/SLA reporting.

5\. Pilot Risks

Risk: Ops preview latency



Status: Known and deferred.



Current observation:



local latency is approximately 0.6 seconds

staging latency has been approximately 17 to 18 seconds



Likely causes:



Azure Function cold start

storage access latency

production-sized data



Pilot impact:



moderate annoyance

not currently a blocker if operators understand the delay



Mitigation:



document expected latency

avoid relying on ops-preview as a high-frequency interaction

revisit after pilot-critical workflows are stable

Risk: Coarse API-key protection



Status: Accepted for controlled pilot.



Pilot impact:



acceptable for limited/internal operator testing

not suitable as final production auth



Mitigation:



keep pilot controlled

limit key distribution

continue route inventory and operator attribution discipline

Risk: Operator onboarding is code/config driven



Status: Acceptable for pilot.



Pilot impact:



adding operators requires code/config update

not ideal, but manageable for a small pilot



Mitigation:



maintain explicit operator registry

document registry update procedure

Go / No-Go Checklist

Go Criteria

CI green.

Staging deploy green.

Today cockpit flow validated.

Followup lifecycle validated.

Operator attribution enforced.

Runtime surface documented and guarded.

Known latency issue acknowledged.

Pilot operators trained on workflow and expected delays.

No-Go Criteria

Today cockpit cannot complete Ready Care to Resolved.

Formation events fail to persist.

Followup queue does not update after mutations.

Staging deploy is broken.

API key protection is bypassed on protected mutation routes.

Operators cannot identify the correct visitor/followup action.

Recommendation



Proceed toward a controlled pilot after completing a short pilot operations packet:



pilot operator workflow guide

staging health checklist

incident notes template

operator registry update procedure

known limitations note



No additional major backend architecture work is required before the controlled pilot.


