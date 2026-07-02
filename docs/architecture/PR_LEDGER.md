# PR Ledger Summary

## Dashboard Next PRs

| PR | Merged | Title |
|---:|---|---|
| #1 | 2026-06-08 | Add dashboard app shell foundation |
| #2 | 2026-06-08 | Wire Today cockpit read model |
| #3 | 2026-06-08 | Improve Today cockpit pastoral experience |
| #4 | 2026-06-08 | Add people profile foundation |
| #5 | 2026-06-08 | Add journey story experience |
| #6 | 2026-06-08 | Add care workspace foundation |
| #7 | 2026-06-08 | Add opportunity intelligence foundation |
| #8 | 2026-06-08 | Add executive ministry command center |
| #9 | 2026-06-08 | Document dashboard pilot setup |
| #10 | 2026-06-08 | Add persistent visitor snapshot rail |
| #11 | 2026-06-08 | Ignore local Vercel project metadata |
| #12 | 2026-06-09 | Add global visitor context |
| #13 | 2026-06-09 | Add care ownership actions |
| #14 | 2026-06-09 | Add care outcome actions |
| #15 | 2026-06-09 | Use known actor for care outcome events |
| #16 | 2026-06-09 | Add next step actions |
| #17 | 2026-06-09 | Normalize journey visitor context |
| #18 | 2026-06-09 | Add visitor note action to People profile |
| #19 | 2026-06-09 | Add create visitor action to People |
| #20 | 2026-06-09 | Show full person timeline on People profile |
| #21 | 2026-06-09 | Add care ownership action to People profile |
| #22 | 2026-06-09 | Add journey next step action to People profile |
| #23 | 2026-06-09 | Add person phone and identity editing |
| #24 | 2026-06-10 | Add People directory search |
| #25 | 2026-06-10 | Hide test people by default |
| #26 | 2026-06-11 | Polish People test records toggle |
| #27 | 2026-06-11 | Add address and birthday support to people dashboard |
| #28 | 2026-06-11 | Show latest care outcome on care cards |
| #29 | 2026-06-11 | Show next step timestamps on dashboard cards |
| #30 | 2026-06-12 | Show followup outcome on dashboard cards |
| #31 | 2026-06-12 | Show prayer request timestamp on dashboard cards |
| #32 | 2026-06-12 | Show followup assignment timestamp on dashboard cards |
| #33 | 2026-06-12 | Show formation stage metadata on dashboard cards |
| #34 | 2026-06-23 | Harden dashboard env examples |
| #35 | 2026-06-23 | Add dashboard backend smoke helper |
| #36 | 2026-06-23 | Surface dashboard backend data health |
| #37 | 2026-06-23 | Fix dashboard data health imports |
| #38 | 2026-06-23 | Load people profile timeline |
| #39 | 2026-06-23 | Make People timeline loading nonfatal |
| #40 | 2026-06-23 | Make People profile subloads nonfatal |
| #41 | 2026-06-23 | Make Today dashboard loads nonfatal |
| #42 | 2026-06-23 | Make Care page loads nonfatal |
| #43 | 2026-07-01 | Make Journey page backend loads nonfatal |
| #44 | 2026-07-01 | Make Insights worklist loads nonfatal |
| #45 | 2026-07-01 | Fix People selected visitor fallback |
| #46 | 2026-07-01 | Improve Today page pastor-first language |
| #47 | 2026-07-01 | Improve People page pastor-first language |
| #48 | 2026-07-01 | Improve Journey page pastor-first language |
| #49 | 2026-07-01 | Improve Care page pastor-first language |
| #50 | 2026-07-01 | Improve Insights page pastor-first language |
| #51 | 2026-07-01 | Improve Admin readiness language |
| #52 | 2026-07-02 | Show selected person name across ministry pages |
| #53 | 2026-07-02 | Add shared person ministry header |
| #54 | 2026-07-02 | Fix selected person header identity fallback |
| #55 | 2026-07-02 | Add Ministry OS v2 blueprint |
| #56 | 2026-07-02 | Polish Today command center copy |
| #57 | 2026-07-02 | Add actionable Today ministry plan |
| #58 | 2026-07-02 | Polish Today selected person panel copy |
| #59 | 2026-07-02 | Polish Person 360 ministry experience |
| #60 | 2026-07-02 | Polish Journey story language |
| #62 | 2026-07-02 | Polish Insights ministry readiness copy |

## API PR Waves

### Global timeline and integration foundation (#650-#707)

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
| #659 | 2026-04-21 | feat(followups): surface priority from engagement risk in dashboard card |
| #660 | 2026-04-21 | feat(ops-followups): enrich queue with engagement risk priority |
| #661 | 2026-04-21 | docs: sync engagement intelligence + ops queue priority |
| #662 | 2026-04-21 | test(ops): assert followup queue risk enrichment and ordering |

### Ordering, dashboard architecture, and governance foundation (#897-#916)

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
| #905 | 2026-05-19 | docs: define pastoral ai guidance surfaces |
| #906 | 2026-05-19 | docs: define formation journey visualization |
| #907 | 2026-05-19 | docs: define operational ministry insights architecture |
| #908 | 2026-05-19 | docs: define ministry communication architecture |

### Replay, projection, and deterministic regression hardening (#917-#983)

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
| #925 | 2026-05-25 | refactor: extract deterministic formation projection comparison |
| #926 | 2026-05-25 | refactor: extract deterministic formation stage transitions |
| #927 | 2026-05-25 | refactor: extract deterministic formation touchpoint advancement |
| #928 | 2026-05-25 | refactor: extract deterministic followup assignment mutation |

### Pilot operations, route inventory, operator governance (#984-#1012)

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
| #992 | 2026-05-30 | docs(runtime): add route surface inventory |
| #993 | 2026-05-30 | test(runtime): guard route surface inventory |
| #994 | 2026-05-30 | Feature/pilot readiness review  |
| #995 | 2026-05-30 | docs(pilot): add operations packet |

### Followup outcomes and care read-model foundation (#1013-#1055)

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
| #1021 | 2026-06-02 | feat(care): add care candidate derivation |
| #1022 | 2026-06-02 | feat(care): add care candidate list derivation |
| #1023 | 2026-06-02 | feat(care): add care queue read service |
| #1024 | 2026-06-02 | feat(care): add care candidates endpoint |

### Care projection integrity and cross-surface contracts (#1056-#1075)

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
| #1064 | 2026-06-03 | Harden ops followups projection consistency |
| #1065 | 2026-06-03 | Harden ops followups operator contracts |
| #1066 | 2026-06-03 | Add cross-surface derivation regression contract |
| #1067 | 2026-06-03 | docs: close out cross-surface derivation hardening |

### Activity intelligence and opportunity worklists (#1076-#1091)

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
| #1084 | 2026-06-05 | Add activity intelligence checkpoint |
| #1085 | 2026-06-05 | Add activity intelligence opportunity worklists |
| #1086 | 2026-06-05 | Reuse shared opportunity segment definitions |
| #1087 | 2026-06-05 | Add opportunity worklists regression script |

### People workflow, identity fields, notes, dashboard-card contract loop (#1092-#1109)

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
| #1100 | 2026-06-11 | Align unified timeline route docs |
| #1101 | 2026-06-11 | Expose next step timestamps on dashboard card |
| #1102 | 2026-06-11 | Add next step visibility update notes |
| #1103 | 2026-06-11 | Expose followup outcome fields on dashboard card |

### Express/Azure parity and contract coverage (#1110-#1123)

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
| #1118 | 2026-06-16 | docs: record final route parity milestone |
| #1119 | 2026-06-16 | docs: add backend contract coverage inventory |
| #1120 | 2026-06-17 | test(contract): add dashboard card contract coverage |
| #1121 | 2026-06-17 | test(contract): add activity intelligence contract coverage |

### Backend hardening, opportunity narrative, staging certification (#1124-#1137)

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
| #1132 | 2026-06-23 | Record ops preview latency diagnostic baseline |
| #1133 | 2026-06-23 | Align task preview simulation compliance assertions |
| #1134 | 2026-06-23 | Record pilot readiness staging certification |
| #1136 | 2026-06-23 | Reduce task preview queue enrichment latency |

