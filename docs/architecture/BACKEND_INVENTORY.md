# Backend Inventory

Generated from merged `hope-ai-api` PR history.

## Engineering Waves

### Global timeline and integration foundation

Status: Complete  
PR range: #650-#707  
Merged PR count: 57

| PR | Merged | Title |
|---:|---|---|
| #650 | 2026-04-20 | Add debugShadow parity output for global timeline |
| #651 | 2026-04-20 | Add debugShadow output to global timeline function |
| #652 | 2026-04-20 | Write engagement events to global timeline store |
| #653 | 2026-04-20 | Write engagement events to global timeline store at repository level |
| #655 | 2026-04-21 | Fix integration cutover: scope shadow to global, correct routes, stabilize tie ordering |
| #656 | 2026-04-21 | docs: sync master plan and checklist to reflect global timeline stabilization and current phase status |
| #657 | 2026-04-21 | feat(engagement): add risk and drift endpoint with regression coverage |
| #658 | 2026-04-21 | feat(visitor-summary): surface engagement risk in summary and dashboard |

### Ordering, dashboard architecture, and governance foundation

Status: Complete  
PR range: #897-#916  
Merged PR count: 20

| PR | Merged | Title |
|---:|---|---|
| #897 | 2026-05-19 | docs(dashboard): define new dashboard product architecture |
| #898 | 2026-05-19 | docs(dashboard): define today view system design |
| #899 | 2026-05-19 | docs(dashboard): define dashboard component system |
| #900 | 2026-05-19 | docs: finalize visitor detail experience architecture |
| #901 | 2026-05-19 | docs: define unified timeline experience architecture |
| #902 | 2026-05-19 | docs: define followup intelligence experience architecture |
| #903 | 2026-05-19 | docs: define dashboard navigation architecture |
| #904 | 2026-05-19 | docs: define ministry workflow orchestration architecture |

### Replay, projection, and deterministic regression hardening

Status: Complete  
PR range: #917-#983  
Merged PR count: 67

| PR | Merged | Title |
|---:|---|---|
| #917 | 2026-05-25 | test: add deterministic replay regression coverage |
| #918 | 2026-05-25 | test: expand replay and projection hardening coverage |
| #919 | 2026-05-25 | test: harden projection pagination and cursor behavior |
| #920 | 2026-05-25 | docs: close replay and projection hardening items |
| #921 | 2026-05-25 | test: add integration projection hardening coverage |
| #922 | 2026-05-25 | test: add global timeline parity hardening coverage |
| #923 | 2026-05-25 | test: add rebuild audit and replay gap hardening |
| #924 | 2026-05-25 | docs: record replay integrity hardening wave |

### Pilot operations, route inventory, operator governance

Status: Complete  
PR range: #984-#1012  
Merged PR count: 29

| PR | Merged | Title |
|---:|---|---|
| #984 | 2026-05-29 | docs: record today cockpit MVP checkpoint |
| #985 | 2026-05-30 | feat(formation): add actor attribution support to v1 envelopes |
| #986 | 2026-05-30 | feat(formation): persist actor attribution in profiles |
| #987 | 2026-05-30 | feat(ops): surface actor attribution in followups queue |
| #988 | 2026-05-30 | feat(formation): require actor attribution for followup mutations |
| #989 | 2026-05-30 |  feat(operators): centralize identity resolution |
| #990 | 2026-05-30 | feat(formation): require known operator actors |
| #991 | 2026-05-30 | feat(operators): formalize operator registry |

### Followup outcomes and care read-model foundation

Status: Complete  
PR range: #1013-#1055  
Merged PR count: 43

| PR | Merged | Title |
|---:|---|---|
| #1013 | 2026-06-02 | docs(pilot): clarify followup outcome handling |
| #1014 | 2026-06-02 | docs(pilot): document followup outcome limitations |
| #1015 | 2026-06-02 | docs(followups): define outcome semantics v2 |
| #1016 | 2026-06-02 | Fix/non terminal followup outcomes |
| #1017 | 2026-06-02 | fix(integration): pass followup outcome into summary derivation |
| #1018 | 2026-06-02 | fix(formation): prevent non-terminal outcomes from advancing stage |
| #1019 | 2026-06-02 | test(followups): add cross-surface outcome consistency matrix |
| #1020 | 2026-06-02 | docs(care): define care workflow model v1 |

### Care projection integrity and cross-surface contracts

Status: Complete  
PR range: #1056-#1075  
Merged PR count: 20

| PR | Merged | Title |
|---:|---|---|
| #1056 | 2026-06-03 | test(care): add assignment command validation contract |
| #1057 | 2026-06-03 | fix(care): paginate candidate detail and summary projections |
| #1058 | 2026-06-03 | test(care): add assignment summary regression |
| #1059 | 2026-06-03 | test(care): add projection consistency regression |
| #1060 | 2026-06-03 | test(care): wire assignment regressions into runner |
| #1061 | 2026-06-03 | fix(care): paginate export projections and add regression |
| #1062 | 2026-06-03 | fix(care): repair candidate list pagination and add regression |
| #1063 | 2026-06-03 | Harden care regression gate and followup regression contracts |

### Activity intelligence and opportunity worklists

Status: Complete  
PR range: #1076-#1091  
Merged PR count: 16

| PR | Merged | Title |
|---:|---|---|
| #1076 | 2026-06-05 | Add ministry activity intelligence endpoint |
| #1077 | 2026-06-05 | Enrich integration timeline ministry language |
| #1078 | 2026-06-05 | Add formation projection intelligence signals |
| #1079 | 2026-06-05 | Add formation cohort intelligence signals |
| #1080 | 2026-06-05 | Add formation opportunity intelligence |
| #1081 | 2026-06-05 | Add opportunity drilldown metadata |
| #1082 | 2026-06-05 | Add formation profile segment filters |
| #1083 | 2026-06-05 | Add formation segment intelligence test |

### People workflow, identity fields, notes, dashboard-card contract loop

Status: Complete  
PR range: #1092-#1109  
Merged PR count: 18

| PR | Merged | Title |
|---:|---|---|
| #1092 | 2026-06-09 | Require API key for engagement event ingestion |
| #1093 | 2026-06-09 | Document pilot command validation |
| #1094 | 2026-06-09 | Add visitor notes command endpoint |
| #1095 | 2026-06-09 | Document People workflow pilot readiness |
| #1096 | 2026-06-09 | Add visitor phone support and identity update endpoint |
| #1097 | 2026-06-11 | Add visitor address and birthday fields |
| #1098 | 2026-06-11 | Assert care candidate outcome source timestamp |
| #1099 | 2026-06-11 | Add June 11 dashboard and care contract updates |

### Express/Azure parity and contract coverage

Status: Complete  
PR range: #1110-#1123  
Merged PR count: 14

| PR | Merged | Title |
|---:|---|---|
| #1110 | 2026-06-16 | fix(express): add care route parity |
| #1111 | 2026-06-16 | fix(express): add activity intelligence route parity |
| #1112 | 2026-06-16 | fix(express): add visitor mutation route parity |
| #1113 | 2026-06-16 | docs: record backend parity hardening |
| #1114 | 2026-06-16 | fix(express): add dashboard followups route parity |
| #1115 | 2026-06-16 | fix(express): add ops route parity |
| #1116 | 2026-06-16 | fix(express): add final route parity |
| #1117 | 2026-06-16 | test(regression): add final route parity contract |

### Backend hardening, opportunity narrative, staging certification

Status: Complete  
PR range: #1124-#1137  
Merged PR count: 13

| PR | Merged | Title |
|---:|---|---|
| #1124 | 2026-06-22 | Harden journey formation profile drift assertions |
| #1125 | 2026-06-22 | Harden task preview derivation audit |
| #1126 | 2026-06-22 | Harden visitor profile invariant coverage |
| #1127 | 2026-06-22 | Close backend hardening audit checklist items |
| #1128 | 2026-06-22 | Add canonical opportunity narrative to worklists |
| #1129 | 2026-06-22 | Close opportunity narrative checklist item |
| #1130 | 2026-06-23 | Add ops preview latency diagnostic helper |
| #1131 | 2026-06-23 | Fix ops preview latency diagnostic output |

## Canonical Backend Domains

| Domain | Status | Notes |
|---|---|---|
| Identity | Complete | Visitor create/read/update, phone, address, birthday, notes command. |
| Formation | Complete/Hardening | Runtime, profile projection, replay, drift, actor attribution, prayer/next-step/followup projections. |
| Care | Complete for pilot | Candidate read model, summary, export, assignment, bulk assignment, integrity checks. |
| Followups | Complete for pilot | Terminal/non-terminal semantics, dashboard and OPS queues, attribution. |
| Timeline | Complete for pilot | Integration/global timeline, shadow parity, unified route docs. |
| Dashboard Card | Complete for pilot | Stage, next step, outcome, prayer, assignment, risk/recommendation consistency. |
| Activity Intelligence | Complete for pilot | Formation cohorts, opportunities, worklists, contract coverage. |
| Opportunity Intelligence | Complete for pilot | Worklists, action reasons, resolution metadata, canonical narrative. |
| Ops / Simulation | Deferred for pastor UI | Read-only simulation/diagnostics remain OPS/admin; no orchestration activation. |
| Route parity | Complete | Express/Azure parity for care, activity, dashboard followups, ops, visitor mutation, protected ping. |
