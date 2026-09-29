import type {
  CareAgeBucket,
  CarePriority,
  EscalationLevel
} from "../care/careCandidateContracts";
import type {
  MinistryAreaReadinessAction
} from "./ministryAreaReadinessRecommendation";
import {
  readMinistryAreaReadinessSnapshot,
  type MinistryAreaReadinessDependencies
} from "./readMinistryAreaReadiness";

export type MinistryAreaRecommendedActionWorklistItem =
  | {
      kind: "care";
      visitorId: string;
      ownerStaffId: string;
      carePriority: CarePriority;
      careAgeBucket: CareAgeBucket;
      escalationLevel: EscalationLevel;
    }
  | {
      kind: "six-week-followup";
      visitorId: string;
      ownerStaffId: string;
      taskStatus: "due" | "overdue";
      weekNumber: number;
      dueDate: string;
    };

export type MinistryAreaRecommendedActionWorklist = {
  ministryArea: {
    ministryAreaId: string;
    displayName: string;
    status: "active" | "inactive";
  };
  recommendedFirstAction: MinistryAreaReadinessAction | null;
  items: MinistryAreaRecommendedActionWorklistItem[];
};

export async function readMinistryAreaRecommendedActionWorklist(
  ministryAreaId: string,
  dependencies: MinistryAreaReadinessDependencies = {}
): Promise<MinistryAreaRecommendedActionWorklist | null> {
  const snapshot = await readMinistryAreaReadinessSnapshot(
    ministryAreaId,
    dependencies
  );

  if (!snapshot) {
    return null;
  }

  const { readiness, recommendedActionRecords } = snapshot;
  const action = readiness.recommendedFirstAction;
  const items: MinistryAreaRecommendedActionWorklistItem[] =
    action === null
      ? []
      : action.source === "care"
        ? recommendedActionRecords.careCandidates.map(candidate => {
            if (candidate.assignedTo === null) {
              throw new Error(
                "Recommended care worklist item has no canonical owner"
              );
            }

            return {
              kind: "care",
              visitorId: candidate.visitorId,
              ownerStaffId: candidate.assignedTo,
              carePriority: candidate.carePriority,
              careAgeBucket: candidate.careAgeBucket,
              escalationLevel: candidate.escalationLevel
            };
          })
        : recommendedActionRecords.sixWeekFollowups.map(item => {
            const task = item.plan.nextTask;

            if (
              item.plan.ownerStaffId === null ||
              !task ||
              (task.status !== "due" && task.status !== "overdue")
            ) {
              throw new Error(
                "Recommended follow-up worklist item is not actionable"
              );
            }

            return {
              kind: "six-week-followup",
              visitorId: item.visitorId,
              ownerStaffId: item.plan.ownerStaffId,
              taskStatus: task.status,
              weekNumber: task.weekNumber,
              dueDate: task.dueDate
            };
          });

  if (action !== null && items.length !== action.count) {
    throw new Error(
      "Recommended action count does not match worklist item count"
    );
  }

  return {
    ministryArea: {
      ministryAreaId: readiness.ministryArea.ministryAreaId,
      displayName: readiness.ministryArea.displayName,
      status: readiness.ministryArea.status
    },
    recommendedFirstAction: action,
    items
  };
}