import { applyCareEvent, type CareCaseState } from "./care.aggregate";
import type { CareEvent } from "./care.events";

export type CareProfile = {
  memberId: string;
  cases: CareCaseState[];
  activeCaseIds: string[];
  stalledCaseIds: string[];
  closedCaseIds: string[];
  lastUpdatedAt: string | null;
};

export function createInitialCareProfile(memberId: string): CareProfile {
  return { memberId, cases: [], activeCaseIds: [], stalledCaseIds: [], closedCaseIds: [], lastUpdatedAt: null };
}

export function applyCareEventToProfile(profile: CareProfile, event: CareEvent): CareProfile {
  const existing = profile.cases.find((careCase) => careCase.caseId === event.caseId);
  const nextCase = applyCareEvent(existing ?? { caseId: event.caseId, memberId: event.memberId, ownerId: null, priority: null, notes: [], stalledSince: null, closedAt: null, status: "open" }, event);
  const cases = existing
    ? profile.cases.map((careCase) => careCase.caseId === event.caseId ? nextCase : careCase)
    : [...profile.cases, nextCase];

  return {
    memberId: event.memberId,
    cases,
    activeCaseIds: cases.filter((careCase) => careCase.status === "open").map((careCase) => careCase.caseId),
    stalledCaseIds: cases.filter((careCase) => careCase.status === "stalled").map((careCase) => careCase.caseId),
    closedCaseIds: cases.filter((careCase) => careCase.status === "closed").map((careCase) => careCase.caseId),
    lastUpdatedAt: event.occurredAt
  };
}