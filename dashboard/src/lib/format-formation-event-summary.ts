export function formatFormationEventSummary(
  type: string | null | undefined,
  metadata: any
): string {
  const nextStep = metadata?.data?.nextStep;

  switch (type) {
    case "NEXT_STEP_SELECTED":
      return typeof nextStep === "string" && nextStep.trim()
        ? `Selected next step: ${nextStep.trim()}`
        : "Selected a next step";

    default:
      return type?.trim() || "Formation event";
  }
}
