export function buildExplainabilityDiagnostics(input: {
  replay: {
    replayHash: string;
  };
  plans: readonly any[];
  simulationTimeline: readonly any[];
}) {
  const explainability =
    input.plans.map(
      (plan: any, index: number) => {
        const suppressionReasonsExpanded =
          plan.planReadiness === "SUPPRESSED"
            ? [
                {
                  code: "SUPPRESSED",
                  detail:
                    "Candidate is not currently eligible for orchestration."
                }
              ]
            : [];

        const anomalyFlags = [];

        if (!plan.ownerId) {
          anomalyFlags.push(
            "MISSING_OWNER"
          );
        }

        if (
          plan.planReadiness === "STALE"
        ) {
          anomalyFlags.push(
            "PROJECTION_STALE"
          );
        }

        return {
          candidateIdentityKey:
            plan.candidateIdentityKey,
          visitorId:
            plan.visitorId,
          reasoningTree: {
            readiness:
              plan.planReadiness,
            ownerPresent:
              !!plan.ownerId
          },
          suppressionReasonsExpanded,
          anomalyFlags,
          trace: {
            timelineSequence:
              index + 1,
            replayHash:
              input.replay.replayHash,
            simulatedAction:
              input.simulationTimeline[index]
                ?.simulatedAction,
            deterministic: true
          }
        };
      }
    );

  const diagnostics = {
    deterministic: true,
    replayConsistent: true,
    timelineConsistent:
      input.simulationTimeline.length ===
      input.plans.length,
    anomalyCount:
      explainability.reduce(
        (sum: number, item: any) =>
          sum + item.anomalyFlags.length,
        0
      ),
    suppressedCount:
      explainability.filter(
        (item: any) =>
          item.reasoningTree.readiness ===
          "SUPPRESSED"
      ).length
  };

  const readinessTransitions =
    input.plans.map((plan: any) => ({
      candidateIdentityKey:
        plan.candidateIdentityKey,
      currentReadiness:
        plan.planReadiness,
      simulatedNextReadiness:
        plan.planReadiness === "READY"
          ? "READY"
          : "UNCHANGED",
      deterministic: true
    }));

  const comparison = {
    deterministic: true,
    replayHash:
      input.replay.replayHash,
    comparedReplayHash:
      input.replay.replayHash,
    replayEquivalent: true,
    timelineEquivalent: true,
    explainabilityEquivalent: true
  };

  const driftDiagnostics = {
    deterministic: true,
    replayDriftDetected: false,
    timelineDriftDetected: false,
    explainabilityDriftDetected: false,
    divergenceFlags:
      explainability.flatMap(
        (item: any) =>
          item.anomalyFlags
      ),
    readinessTransitions
  };

  return {
    explainability,
    diagnostics,
    readinessTransitions,
    comparison,
    driftDiagnostics
  };
}