type FormationEvent = {
  id: string | null;
  rowKey: string | null;
  visitorId: string | null;
  type: string | null;
  occurredAt: string | null;
  recordedAt: string | null;
  channel: string | null;
  summary: string | null;
  metadata: {
    source?: Record<string, unknown>;
    data?: Record<string, unknown>;
  } | null;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getEventSummary(event: FormationEvent): string {
  if (event.type === "NEXT_STEP_SELECTED") {
    const nextStep = event.metadata?.data?.nextStep;
    
  }

  const nextStep = event.metadata?.data?.nextStep;
  if (event.type === "NEXT_STEP_SELECTED" && typeof nextStep === "string" && nextStep.trim()) {
    return "Selected next step: " + nextStep.trim();
  }

  return event.summary?.trim() || event.type?.trim() || "Formation event";
}

export { formatDateTime, getEventSummary };
export type { FormationEvent };


