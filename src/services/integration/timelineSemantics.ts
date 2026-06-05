export function getTimelineSummary(type: string | null | undefined): string {
  const normalized = String(type ?? "").trim();

  switch (normalized) {
    case "FOLLOWUP_ASSIGNED":
      return "Care ownership assigned";

    case "FOLLOWUP_CONTACTED":
      return "Pastoral contact made";

    case "FOLLOWUP_OUTCOME_RECORDED":
      return "Care outcome recorded";

    case "FOLLOWUP_UNASSIGNED":
      return "Care ownership removed";

    case "NEXT_STEP_SELECTED":
      return "Visitor selected a next step";

    case "NEXT_STEP_COMPLETED":
      return "Visitor completed a next step";

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
