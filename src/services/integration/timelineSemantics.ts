export function getTimelineSummary(type: string | null | undefined): string {
  const normalized = String(type ?? "").trim();

  switch (normalized) {
    case "FOLLOWUP_ASSIGNED":
      return "Followup assigned";

    case "FOLLOWUP_CONTACTED":
      return "Contact made";

    case "FOLLOWUP_OUTCOME_RECORDED":
      return "Outcome recorded";

    case "FOLLOWUP_UNASSIGNED":
      return "Followup unassigned";

    case "NEXT_STEP_SELECTED":
      return "Next step selected";

    case "NEXT_STEP_COMPLETED":
      return "Next step completed";

    default:
      return normalized || "Activity recorded";
  }
}

export function getTimelineActivityType(
  type: string | null | undefined
): string {
  const normalized = String(type ?? "").trim();

  switch (normalized) {
    case "FOLLOWUP_ASSIGNED":
      return "FOLLOWUP_ASSIGNED";

    case "FOLLOWUP_CONTACTED":
      return "CONTACT_MADE";

    case "FOLLOWUP_OUTCOME_RECORDED":
      return "FOLLOWUP_COMPLETED";

    case "FOLLOWUP_UNASSIGNED":
      return "FOLLOWUP_UNASSIGNED";

    case "NEXT_STEP_SELECTED":
      return "NEXT_STEP_SELECTED";

    case "NEXT_STEP_COMPLETED":
      return "NEXT_STEP_COMPLETED";

    default:
      return normalized || "UNKNOWN";
  }
}
