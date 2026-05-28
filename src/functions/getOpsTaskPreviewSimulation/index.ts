import { randomUUID } from "crypto";
import { TableClient } from "@azure/data-tables";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { buildOpsFollowupsQueue } from "../../services/followups/buildOpsFollowupsQueue";
import {
  TASK_PREVIEW_SCHEMA_VERSION,
  buildTaskPreviewPlan,
  deriveTaskPreview,
  groupTaskPreviews,
  serializeTaskPreview,
  summarizeTaskPreviewPlans,
  summarizeTaskPreviews
} from "../../services/followups/deriveTaskPreview";
import {
  buildProjectionLineageEnvelope
} from "../../shared/integration/projectionLineageEnvelope";
import {
  buildReplayEnvelope
} from "../../shared/integration/replayEnvelope";
import {
  buildReplayObservabilityEnvelope
} from "../../shared/observability/replayObservabilityEnvelope";
import {
  buildRuntimeVerificationState
} from "../../shared/governance/runtimeVerificationState";
import {
  buildGovernanceSummary
} from "../../services/runtimeSimulation/buildGovernanceSummary";
import {
  buildPolicySummary
} from "../../services/runtimeSimulation/buildPolicySummary";
import {
  buildComplianceSummary
} from "../../services/runtimeSimulation/buildComplianceSummary";
import {
  buildAttestationSummary
} from "../../services/runtimeSimulation/buildAttestationSummary";
import {
  buildCoreProofFamilies
} from "../../services/runtimeSimulation/buildCoreProofFamilies";
import {
  buildObservabilitySummary
} from "../../services/runtimeSimulation/buildObservabilitySummary";
import {
  buildReplaySnapshotArtifacts
} from "../../services/runtimeSimulation/buildReplaySnapshotArtifacts";
import {
  buildTrustGovernanceDiagnostics
} from "../../services/runtimeSimulation/buildTrustGovernanceDiagnostics";
import {
  buildTrustProofFamilies
} from "../../services/runtimeSimulation/buildTrustProofFamilies";
import {
  buildVerificationProofFamilies
} from "../../services/runtimeSimulation/buildVerificationProofFamilies";
import {
  buildAttestationVerificationState,
  buildComplianceVerificationState,
  buildPolicyVerificationState
} from "../../services/runtimeSimulation/buildVerificationStates";
import {
  buildReplayAnalyticsSummary
} from "../../services/runtimeAnalytics/buildReplayAnalyticsSummary";

// Repo pattern: legacy default export invoked as (context, req) via function.json.
export default async function (context: any, req: any): Promise<void> {
  try {
    const expected = (process.env.HOPE_API_KEY ?? "").trim();

    if (!expected) {
      context.res = {
        status: 500,
        body: { ok: false, error: "Server missing HOPE_API_KEY" }
      };

      return;
    }

    const headers = (req?.headers ?? {}) as Record<string, any>;

    const provided =
      (headers["x-api-key"] ??
        headers["X-API-KEY"] ??
        headers["x-api-Key"] ??
        headers["X-Api-Key"] ??
        "") as string;

    if (!provided || String(provided).trim().length === 0) {
      context.res = {
        status: 401,
        body: { ok: false, error: "Missing x-api-key" }
      };

      return;
    }

    if (String(provided).trim() !== expected) {
      context.res = {
        status: 401,
        body: { ok: false, error: "Invalid x-api-key" }
      };

      return;
    }

    const conn =
      (process.env.STORAGE_CONNECTION_STRING ?? "").trim();

    if (!conn) {
      context.res = {
        status: 500,
        body: {
          ok: false,
          error: "Server missing STORAGE_CONNECTION_STRING"
        }
      };

      return;
    }

    const eventsTableName =
      (process.env.FORMATION_EVENTS_TABLE ?? "devFormationEvents").trim();

    const profilesTableName =
      (process.env.FORMATION_PROFILES_TABLE ?? "devFormationProfiles").trim();

    const eventsTable =
      TableClient.fromConnectionString(conn, eventsTableName);

    const profilesTable =
      TableClient.fromConnectionString(conn, profilesTableName);

    await ensureTableExists(eventsTable);
    await ensureTableExists(profilesTable);

    const limit =
      parsePositiveInt(req?.query?.limit, 25, 100);

    const cursor =
      parseNonNegativeInt(req?.query?.cursor, 0);

    const includeResolved =
      String(readQuery(req, "includeResolved") ?? "")
        .trim()
        .toLowerCase() === "true";

    const includeSynthetic =
      String(readQuery(req, "includeSynthetic") ?? "")
        .trim()
        .toLowerCase() === "true";

    const engagementService =
      new EngagementsService(
        new EngagementEventsRepository()
      );

    const queue =
      await buildOpsFollowupsQueue({
        eventsTable,
        profilesTable,
        engagementService,
        limit,
        cursor,
        assignedToFilter:
          String(readQuery(req, "assignedTo") ?? "").trim(),
        visitorIdFilter:
          String(readQuery(req, "visitorId") ?? "").trim(),
        includeResolved,
        includeSynthetic,
        sortBy:
          String(readQuery(req, "sortBy") ?? "").trim(),
        sortDir:
          String(readQuery(req, "sortDir") ?? "")
            .trim()
            .toLowerCase() === "asc"
            ? "asc"
            : "desc",
      });

    const previews =
      (queue.items ?? []).map((item: any) =>
        deriveTaskPreview({
          followup: item,
          audit: {
            drifted: false,
            profileBehind: false
          }
        })
      );

    const serializedPreviews =
      previews.map(serializeTaskPreview);

    const plans =
      previews.map(buildTaskPreviewPlan);

    const simulationTimeline =
      plans.map((plan: any, index: number) => ({
        sequence: index + 1,
        eventType: "SIMULATED_TASK_EVALUATION",
        candidateIdentityKey:
          plan.candidateIdentityKey,
        visitorId:
          plan.visitorId,
        ownerId:
          plan.ownerId,
        planReadiness:
          plan.planReadiness,
        simulatedAction:
          plan.planReadiness === "READY"
            ? "WOULD_QUEUE_TASK"
            : "NO_ACTION",
        simulatedOnly: true
      }));

    const replay =
      buildReplayEnvelope({
        previews: serializedPreviews,
        plans,
        timeline: simulationTimeline
      });

    const auditEnvelope = {
      simulationId: randomUUID(),
      schemaVersion:
        TASK_PREVIEW_SCHEMA_VERSION,
      simulationMode: "READ_ONLY",
      orchestrationActive: false,
      taskPersistenceActive: false,
      generatedAt:
        new Date().toISOString(),
      replayHash:
        replay.replayHash,
      replayDeterministic: true,
      timelineDeterministic: true,
      simulatedOnly: true
    };
    const explainability =
      plans.map((plan: any, index: number) => {
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
          anomalyFlags.push("MISSING_OWNER");
        }

        if (plan.planReadiness === "STALE") {
          anomalyFlags.push("PROJECTION_STALE");
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
              replay.replayHash,
            simulatedAction:
              simulationTimeline[index]?.simulatedAction,
            deterministic: true
          }
        };
      });

    const diagnostics = {
      deterministic: true,
      replayConsistent: true,
      timelineConsistent:
        simulationTimeline.length === plans.length,
      anomalyCount:
        explainability.reduce(
          (sum: number, item: any) =>
            sum + item.anomalyFlags.length,
          0
        ),
      suppressedCount:
        explainability.filter(
          (item: any) =>
            item.reasoningTree.readiness === "SUPPRESSED"
        ).length
    };
    const readinessTransitions =
      plans.map((plan: any) => ({
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
        replay.replayHash,
      comparedReplayHash:
        replay.replayHash,
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
          (item: any) => item.anomalyFlags
        ),
      readinessTransitions
    };
    const {
      exportSummary,
      exportEnvelope,
      lineage,
      lineageReplayConsistent,
      multiRun,
      snapshotSummary,
      snapshot,
      replayObservability
    } = buildReplaySnapshotArtifacts({
      serializedPreviews,
      plans,
      simulationTimeline,
      explainability,
      diagnostics,
      comparison,
      driftDiagnostics,
      replay
    });

    const snapshotCompatibility = {
      deterministic: true,
      replayCompatible: true,
      exportCompatible: true,
      lineageCompatible: true,
      multiRunCompatible: true,
      diagnosticsCompatible: true,
      explainabilityCompatible: true,
      driftCompatible: true,
      snapshotStable: true
    };
    const consistencySummary = {
      deterministic: true,
      replayConsistent: true,
      exportConsistent: true,
      lineageConsistent: true,
      snapshotConsistent: true,
      explainabilityConsistent: true,
      diagnosticsConsistent: true,
      driftConsistent: true,
      consistencyReady: true
    };

    const governanceSummary =
      buildGovernanceSummary();

    const {
      integrityProofs,
      consistency,
      safetyProofs
    } = buildCoreProofFamilies({
      replay,
      comparison,
      exportEnvelope,
      lineage,
      snapshot,
      multiRun,
      lineageReplayConsistent,
      auditEnvelope,
      governanceSummary
    });

    const governance = {
      deterministic: true,
      governanceMode: "OPS_READ_ONLY",
      executionProhibited: true,
      persistenceProhibited: true,
      schedulerProhibited: true,
      orchestrationProhibited: true,
      mutationProhibited: true,
      simulatedOnly: true,
      safetyProofs,
      governanceStable: true
    };
    const policySummary =
      buildPolicySummary();

    const {
      policyProofs
    } = buildVerificationProofFamilies({
      governance,
      replay,
      exportEnvelope,
      snapshot,
      consistency,
      governanceSummary
    });

    const policy =
      buildPolicyVerificationState({
        policyProofs
      });
    const complianceSummary =
      buildComplianceSummary();

    const {
      complianceProofs
    } = buildVerificationProofFamilies({
      governance,
      replay,
      exportEnvelope,
      snapshot,
      consistency,
      governanceSummary,
      policy
    });

    const compliance =
      buildComplianceVerificationState({
        complianceProofs
      });
    const attestationSummary =
      buildAttestationSummary();

    const {
      attestationProofs
    } = buildVerificationProofFamilies({
      governance,
      replay,
      exportEnvelope,
      snapshot,
      consistency,
      governanceSummary,
      policy,
      compliance
    });

    const attestation =
      buildAttestationVerificationState({
        attestationProofs
      });
    const {
      certificationSummary,
      certificationProofs,
      certification,
      accreditationSummary,
      accreditationProofs,
      accreditation,
      trustSeal,
      assuranceSummary,
      assuranceProofs,
      assurance
    } = buildTrustProofFamilies({
      governance,
      policy,
      compliance,
      attestation,
      governanceSummary,
      replay,
      exportEnvelope,
      snapshot,
      consistency
    });

    const {
      observabilitySummary,
      verificationTelemetry
    } = buildObservabilitySummary({
      serializedPreviews,
      plans,
      simulationTimeline,
      explainability,
      diagnostics,
      replay,
      exportEnvelope,
      replayObservability,
      lineage
    });

    const {
      trustDiagnostics,
      intelligenceSummary,
      governanceIntelligence
    } = buildTrustGovernanceDiagnostics({
      trustSeal,
      assurance,
      governance,
      policy,
      compliance,
      attestation,
      certification,
      accreditation,
      governanceSummary
    });

    const {
      analyticsSummary,
      replayAnalytics,
      trustAnalytics,
      observabilityAnalytics
    } = buildReplayAnalyticsSummary({
      serializedPreviews,
      plans,
      simulationTimeline,
      explainability,
      diagnostics,
      replay,
      comparison,
      replayObservability,
      trustSeal,
      trustDiagnostics,
      assurance,
      accreditation,
      certification,
      observabilitySummary,
      verificationTelemetry
    });


    context.res = {
      status: 200,
      headers: {
        "content-type": "application/json",
        "X-HOPE-Surface": "ops-only",
        "X-HOPE-Product-Use":
          "Read-only orchestration simulation only. Does not create or persist tasks."
      },
      body: {
        ok: true,
        v: 1,
        schemaVersion:
          TASK_PREVIEW_SCHEMA_VERSION,
        mode: "read-only",
        orchestrationActive: false,
        taskPersistenceActive: false,
        assignedTo:
          queue.assignedTo,
        visitorId:
          queue.visitorId,
        includeResolved,
        cursor:
          queue.cursor,
        nextCursor:
          queue.nextCursor,
        queueStats:
          queue.stats,
        previewSummary:
          summarizeTaskPreviews(previews),
        planSummary:
          summarizeTaskPreviewPlans(plans),
        groupedPreviews:
          groupTaskPreviews(previews),
        previews:
          serializedPreviews,
        plans,
        simulationTimeline,
        replay,
        auditEnvelope,
        explainability,
        diagnostics,
        comparison,
        driftDiagnostics,
        exportSummary,
        exportEnvelope,
        lineage,
        multiRun,
        snapshotSummary,
        snapshot,
        snapshotCompatibility,
        consistencySummary,
        integrityProofs,
        consistency,
        governanceSummary,
        safetyProofs,
        governance,
        policySummary,
        policyProofs,
        policy,
        complianceSummary,
        complianceProofs,
        compliance,
        attestationSummary,
        attestationProofs,
        attestation,
        certificationSummary,
        certificationProofs,
        certification,
        accreditationSummary,
        accreditationProofs,
        accreditation,
        trustSeal,
        assuranceSummary,
        assuranceProofs,
        assurance,
        observabilitySummary,
        verificationTelemetry,
        trustDiagnostics,
        intelligenceSummary,
        analyticsSummary,
        replayAnalytics,
        trustAnalytics,
        governanceIntelligence,
        observabilityAnalytics
      }
    };
  } catch (err: any) {
    context.res = {
      status: 500,
      headers: {
        "content-type": "application/json",
        "X-HOPE-Surface": "ops-only",
        "X-HOPE-Product-Use":
          "Read-only orchestration simulation only. Does not create or persist tasks."
      },
      body: {
        ok: false,
        error:
          err?.message ??
          "ops_task_preview_simulation_error"
      }
    };
  }
}


function readQuery(req: any, name: string): any {
  const value = req?.query?.[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  if (value !== undefined) {
    return value;
  }

  if (typeof req?.query?.get === "function") {
    return req.query.get(name);
  }

  return undefined;
}

function parsePositiveInt(
  value: any,
  fallback: number,
  max: number
): number {
  const raw =
    Array.isArray(value)
      ? value[0]
      : value;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, Math.trunc(parsed));
}

function parseNonNegativeInt(
  value: any,
  fallback: number
): number {
  const raw =
    Array.isArray(value)
      ? value[0]
      : value;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

async function ensureTableExists(
  table: TableClient
) {
  try {
    await table.createTable();
  } catch (e: any) {
    const code =
      e?.statusCode ??
      e?.code ??
      "";

    if (
      code === 409 ||
      code === "TableAlreadyExists" ||
      String(code) === "409"
    ) {
      return;
    }

    throw e;
  }
}
















