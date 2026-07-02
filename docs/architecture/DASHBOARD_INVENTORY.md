# Dashboard Inventory

Generated from merged `hope-dashboard-next` PR history.

## Engineering Waves

### Foundation and app shell

Status: Complete  
PR range: #1-#10  
Merged PR count: 10

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

### Visitor context and ministry actions

Status: Complete  
PR range: #11-#23  
Merged PR count: 13

| PR | Merged | Title |
|---:|---|---|
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

### People enrichment and dashboard-card visibility

Status: Complete  
PR range: #24-#33  
Merged PR count: 10

| PR | Merged | Title |
|---:|---|---|
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

### Reliability, smoke, and nonfatal loading

Status: Complete  
PR range: #34-#45  
Merged PR count: 12

| PR | Merged | Title |
|---:|---|---|
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

### Pastor-first Ministry OS polish

Status: Complete  
PR range: #46-#62  
Merged PR count: 16

| PR | Merged | Title |
|---:|---|---|
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

## Page Readiness

| Page | Status | Backend Source | Remaining Pilot Work |
|---|---|---|---|
| Today | Green | dashboard followups, care summary, opportunity worklists, visitor dashboard card | Workflow audit and morning-briefing decision. |
| People / Person 360 | Green | visitors, visitor summary, dashboard card, journey, timeline | Accessibility and long-story usability pass. |
| Journey | Green | formation events/profile/journey endpoints | Empty/error-state audit and workflow continuity. |
| Care | Green | care candidates, care summary, care commands | Action flow usability check. |
| Insights | Green | activity intelligence / opportunity worklists | Segment failure handling is in place; verify pilot wording. |
| Admin | Yellow/Green | readiness/system surfaces | Avoid fake health; add verified health only when contract exists. |

## Component/UX Readiness

| Component/Feature | Status | Notes |
|---|---|---|
| App shell | Complete | Foundation exists from PR #1. |
| Snapshot rail | Complete | Backend-verified state only. |
| Contextual navigation | Complete | Visitor context preserved across workspaces. |
| PersonMinistryHeader | Complete | Shared header and resilient identity fallback. |
| DataHealthBanner | Complete | Backend warnings and nonfatal states. |
| Smoke helper | Complete | Supports backend-backed page verification. |
| Pastor-first copy | Complete for current workspaces | Today, People, Journey, Care, Insights, Admin polished. |
