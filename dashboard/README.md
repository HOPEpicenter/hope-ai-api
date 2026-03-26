# HOPE Dashboard

Operator dashboard for the HOPE AI API project.

## Purpose

This Next.js app provides operator-facing views for:

- Overview
- Follow-ups
- Visitors
- Visitor detail
- Timeline

The dashboard does **not** talk directly to Azure Functions from the browser.  
Client components call local Next route handlers under `/api/dashboard/*`.  
Those route handlers proxy to the configured backend API using server-side environment variables.

---

## Required environment variables

Create a local `.env.local` file in `dashboard/` with:

```env
HOPE_OPS_BASE_URL=http://127.0.0.1:3000
HOPE_API_KEY=832a3a8d-99d9-413f-813a-7f1c53bc98b7
NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE=dmyrie