import type { CareTimelineItem } from "./care.timeline";

export type CareMilestones = { casesStarted: CareTimelineItem[]; firstNotesAdded: CareTimelineItem[]; stallsDetected: CareTimelineItem[]; casesClosed: CareTimelineItem[]; totalCasesStarted: number; totalNotesAdded: number; totalStalls: number; totalCasesClosed: number };
export type CareMilestonesCollection = { memberId: string; milestones: CareMilestones };

export function buildCareMilestones(timeline: readonly CareTimelineItem[]): CareMilestones {
  const casesStarted = timeline.filter((item) => item.type === "CareCaseStarted");
  const stallsDetected = timeline.filter((item) => item.type === "CareStalledDetected");
  const casesClosed = timeline.filter((item) => item.type === "CareCaseClosed");
  const seenCases = new Set<string>();
  const firstNotesAdded = timeline.filter((item) => {
    if (item.type !== "CareNoteAdded" || seenCases.has(item.caseId)) return false;
    seenCases.add(item.caseId);
    return true;
  });
  return { casesStarted, firstNotesAdded, stallsDetected, casesClosed, totalCasesStarted: casesStarted.length, totalNotesAdded: timeline.filter((item) => item.type === "CareNoteAdded").length, totalStalls: stallsDetected.length, totalCasesClosed: casesClosed.length };
}