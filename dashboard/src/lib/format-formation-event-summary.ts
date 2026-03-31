export function formatFormationEventSummary(
  type: string | null | undefined,
  metadata: any
): string {
  const nextStep = metadata?.data?.nextStep;
  const sourceSystem = metadata?.source?.system;

  switch (type) {
    case "NEXT_STEP_SELECTED":
      return typeof nextStep === "string" && nextStep.trim()
        ? `Selected next step: ${nextStep.trim()}`
        : "Selected a next step";

    default:
      if (type?.trim()) {
        return sourceSystem
          ? `${type.trim()} via ${String(sourceSystem)}`
          : type.trim();
      }

      return "Formation event";
  }
}
