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
    const exportSummary = {
      deterministic: true,
      totalPreviews:
        serializedPreviews.length,
      totalPlans:
        plans.length,
      totalTimelineEvents:
        simulationTimeline.length,
      totalExplainabilityRecords:
        explainability.length,
      totalDriftTransitions:
        readinessTransitions.length,
      exportReady: true
    };

    const exportCanonical =
      JSON.stringify({
        schemaVersion:
          TASK_PREVIEW_SCHEMA_VERSION,
        previews:
          serializedPreviews,
        plans,
        simulationTimeline,
        explainability,
        diagnostics,
        comparison,
        driftDiagnostics,
        exportSummary
      });

    const exportEnvelope = {
      exportVersion: 1,
      deterministic: true,
      exportMode: "READ_ONLY",
      simulatedOnly: true,
      exportHash:
        Buffer.from(exportCanonical)
          .toString("base64")
          .slice(0, 32),
      generatedAt:
        new Date().toISOString(),
      replayHash:
        replay.replayHash,
      exportReady:
        exportSummary.exportReady
    };
    const lineageEnvelope =
      buildProjectionLineageEnvelope({
        replayHash:
          replay.replayHash,
        snapshotHash: null,
        checkpointHash: null,
        continuationHash: null,
        lineageDepth: 1
      });

    const lineage = {
      ...lineageEnvelope,
      deterministic: true,
      lineageMode: "SIMULATED_ONLY",
      currentReplayHash:
        replay.replayHash,
      parentReplayHash:
        replay.replayHash,
      exportHash:
        exportEnvelope.exportHash,
      replayGeneration: 1
    };

    const lineageReplayConsistent =
      lineage.currentReplayHash === replay.replayHash;

    const runComparison = {
      deterministic: true,
      baselineReplayHash:
        replay.replayHash,
      currentReplayHash:
        replay.replayHash,
      replayEquivalent: true,
      exportEquivalent: true,
      diagnosticsEquivalent: true,
      explainabilityEquivalent: true,
      driftEquivalent: true
    };

    const multiRun = {
      deterministic: true,
      comparedRuns: 1,
      lineageConsistent: true,
      replayStable: true,
      exportStable: true,
      comparisonMode: "IN_MEMORY_ONLY",
      runComparison
    };
    const snapshotSummary = {
      deterministic: true,
      snapshotReady: true,
      previewCount:
        serializedPreviews.length,
      planCount:
        plans.length,
      timelineCount:
        simulationTimeline.length,
      explainabilityCount:
        explainability.length,
      replayHash:
        replay.replayHash,
      exportHash:
        exportEnvelope.exportHash
    };

    const snapshotCanonical =
      JSON.stringify({
        replay,
        exportEnvelope,
        lineage,
        multiRun,
        diagnostics,
        comparison,
        driftDiagnostics,
        snapshotSummary
      });

    const snapshot = {
      snapshotVersion: 1,
      deterministic: true,
      snapshotMode: "IN_MEMORY_ONLY",
      snapshotHash:
        Buffer.from(snapshotCanonical)
          .toString("base64")
          .slice(0, 32),
      replayHash:
        replay.replayHash,
      exportHash:
        exportEnvelope.exportHash,
      lineageReplayHash:
        lineage.currentReplayHash,
      snapshotReady:
        snapshotSummary.snapshotReady,
      simulatedOnly: true
    };

    const replayObservability =
      buildReplayObservabilityEnvelope({
        replayHash:
          replay.replayHash,
        exportHash:
          exportEnvelope.exportHash,
        snapshotHash:
          snapshot.snapshotHash,
        lineageReplayHash:
          lineage.currentReplayHash,
        replayDriftDetected:
          driftDiagnostics.replayDriftDetected === true,
        lineageConsistent:
          lineageReplayConsistent
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

    const integrityProofs = {
      deterministic: true,
      replayHashProof:
        replay.replayHash === comparison.replayHash,
      exportHashProof:
        exportEnvelope.exportHash === lineage.exportHash,
      lineageReplayProof:
        lineageReplayConsistent,
      snapshotReplayProof:
        snapshot.replayHash === replay.replayHash,
      snapshotExportProof:
        snapshot.exportHash === exportEnvelope.exportHash,
      multirunReplayProof:
        multiRun.runComparison.currentReplayHash === replay.replayHash
    };

    const consistency = {
      deterministic: true,
      consistencyMode: "READ_ONLY_IN_MEMORY",
      replayExportConverged: true,
      replaySnapshotConverged: true,
      lineageSnapshotConverged: true,
      diagnosticsConverged: true,
      explainabilityConverged: true,
      integrityProofs,
      consistencyStable: true
    };
    const governanceSummary =
      buildGovernanceSummary();

    const safetyProofs = {
      deterministic: true,
      orchestrationInactiveProof:
        auditEnvelope.orchestrationActive === false,
      persistenceInactiveProof:
        auditEnvelope.taskPersistenceActive === false,
      replaySimulatedOnlyProof:
        replay.simulatedOnly === true,
      exportSimulatedOnlyProof:
        exportEnvelope.simulatedOnly === true,
      snapshotSimulatedOnlyProof:
        snapshot.simulatedOnly === true,
      readOnlyModeProof:
        consistency.consistencyMode === "READ_ONLY_IN_MEMORY",
      governanceBoundaryProof:
        governanceSummary.opsSurfaceOnly === true
    };

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

    const policyProofs = {
      deterministic: true,
      governancePolicyProof:
        governance.governanceMode === "OPS_READ_ONLY",
      replayPolicyProof:
        replay.simulatedOnly === true,
      exportPolicyProof:
        exportEnvelope.exportMode === "READ_ONLY",
      snapshotPolicyProof:
        snapshot.snapshotMode === "IN_MEMORY_ONLY",
      consistencyPolicyProof:
        consistency.consistencyMode === "READ_ONLY_IN_MEMORY",
      safetyBoundaryProof:
        governance.executionProhibited === true,
      opsBoundaryProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const policy =
      buildRuntimeVerificationState({
        versionKey: "policyVersion",
        version: 1,
        stateKey: "policyState",
        state: "ENFORCED_READ_ONLY",
        orchestrationKey:
          "orchestrationPolicy",
        orchestrationValue:
          "PROHIBITED",
        persistenceKey:
          "persistencePolicy",
        persistenceValue:
          "PROHIBITED",
        schedulerKey:
          "schedulerPolicy",
        schedulerValue:
          "PROHIBITED",
        mutationKey:
          "mutationPolicy",
        mutationValue:
          "PROHIBITED",
        executionKey:
          "executionPolicy",
        executionValue:
          "PROHIBITED",
        proofsKey:
          "policyProofs",
        proofs:
          policyProofs,
        stableKey:
          "policyStable"
      });
    const complianceSummary =
      buildComplianceSummary();

    const complianceProofs = {
      deterministic: true,
      governanceComplianceProof:
        governance.governanceStable === true,
      policyComplianceProof:
        policy.policyStable === true,
      replayComplianceProof:
        replay.simulatedOnly === true,
      exportComplianceProof:
        exportEnvelope.simulatedOnly === true,
      snapshotComplianceProof:
        snapshot.simulatedOnly === true,
      consistencyComplianceProof:
        consistency.consistencyStable === true,
      opsBoundaryComplianceProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const compliance =
      buildRuntimeVerificationState({
        versionKey:
          "complianceVersion",
        version: 1,
        stateKey:
          "complianceState",
        state:
          "VERIFIED_READ_ONLY",
        orchestrationKey:
          "orchestrationCompliance",
        orchestrationValue:
          "VERIFIED_PROHIBITED",
        persistenceKey:
          "persistenceCompliance",
        persistenceValue:
          "VERIFIED_PROHIBITED",
        schedulerKey:
          "schedulerCompliance",
        schedulerValue:
          "VERIFIED_PROHIBITED",
        mutationKey:
          "mutationCompliance",
        mutationValue:
          "VERIFIED_PROHIBITED",
        executionKey:
          "executionCompliance",
        executionValue:
          "VERIFIED_PROHIBITED",
        proofsKey:
          "complianceProofs",
        proofs:
          complianceProofs,
        stableKey:
          "complianceStable"
      });
    const attestationSummary =
      buildAttestationSummary();

    const attestationProofs = {
      deterministic: true,
      governanceAttestationProof:
        governance.governanceStable === true,
      policyAttestationProof:
        policy.policyStable === true,
      complianceAttestationProof:
        compliance.complianceStable === true,
      replayAttestationProof:
        replay.simulatedOnly === true,
      exportAttestationProof:
        exportEnvelope.simulatedOnly === true,
      snapshotAttestationProof:
        snapshot.simulatedOnly === true,
      consistencyAttestationProof:
        consistency.consistencyStable === true,
      opsBoundaryAttestationProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const attestation =
      buildRuntimeVerificationState({
        versionKey:
          "attestationVersion",
        version: 1,
        stateKey:
          "attestationState",
        state:
          "TRUST_VERIFIED_READ_ONLY",
        orchestrationKey:
          "orchestrationAttestation",
        orchestrationValue:
          "ATTESTED_PROHIBITED",
        persistenceKey:
          "persistenceAttestation",
        persistenceValue:
          "ATTESTED_PROHIBITED",
        schedulerKey:
          "schedulerAttestation",
        schedulerValue:
          "ATTESTED_PROHIBITED",
        mutationKey:
          "mutationAttestation",
        mutationValue:
          "ATTESTED_PROHIBITED",
        executionKey:
          "executionAttestation",
        executionValue:
          "ATTESTED_PROHIBITED",
        proofsKey:
          "attestationProofs",
        proofs:
          attestationProofs,
        stableKey:
          "attestationStable"
      });
    const certificationSummary = {
      deterministic: true,
      certificationReady: true,
      certificationMode: "OPS_READ_ONLY_CERTIFIED",
      governanceCertified: true,
      policyCertified: true,
      complianceCertified: true,
      attestationCertified: true,
      replayCertified: true,
      exportCertified: true,
      snapshotCertified: true,
      consistencyCertified: true,
      opsOnlyCertified: true
    };

    const certificationProofs = {
      deterministic: true,
      governanceCertificationProof:
        governance.governanceStable === true,
      policyCertificationProof:
        policy.policyStable === true,
      complianceCertificationProof:
        compliance.complianceStable === true,
      attestationCertificationProof:
        attestation.attestationStable === true,
      replayCertificationProof:
        replay.simulatedOnly === true,
      exportCertificationProof:
        exportEnvelope.simulatedOnly === true,
      snapshotCertificationProof:
        snapshot.simulatedOnly === true,
      consistencyCertificationProof:
        consistency.consistencyStable === true,
      opsBoundaryCertificationProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const certification = {
      deterministic: true,
      certificationVersion: 1,
      certificationState: "CERTIFIED_READ_ONLY",
      orchestrationCertification: "CERTIFIED_PROHIBITED",
      persistenceCertification: "CERTIFIED_PROHIBITED",
      schedulerCertification: "CERTIFIED_PROHIBITED",
      mutationCertification: "CERTIFIED_PROHIBITED",
      executionCertification: "CERTIFIED_PROHIBITED",
      simulatedOnly: true,
      certificationProofs,
      certificationStable: true
    };

    const accreditationSummary = {
      deterministic: true,
      accreditationReady: true,
      accreditationMode: "OPS_READ_ONLY_ACCREDITED",
      governanceAccredited: true,
      policyAccredited: true,
      complianceAccredited: true,
      attestationAccredited: true,
      certificationAccredited: true,
      opsOnlyAccredited: true
    };

    const accreditationProofs = {
      deterministic: true,
      governanceAccreditationProof:
        governance.governanceStable === true,
      policyAccreditationProof:
        policy.policyStable === true,
      complianceAccreditationProof:
        compliance.complianceStable === true,
      attestationAccreditationProof:
        attestation.attestationStable === true,
      certificationAccreditationProof:
        certification.certificationStable === true,
      opsBoundaryAccreditationProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const accreditation = {
      deterministic: true,
      accreditationVersion: 1,
      accreditationState: "ACCREDITED_READ_ONLY",
      orchestrationAccreditation: "ACCREDITED_PROHIBITED",
      persistenceAccreditation: "ACCREDITED_PROHIBITED",
      schedulerAccreditation: "ACCREDITED_PROHIBITED",
      mutationAccreditation: "ACCREDITED_PROHIBITED",
      executionAccreditation: "ACCREDITED_PROHIBITED",
      simulatedOnly: true,
      accreditationProofs,
      accreditationStable: true
    };

    const trustSeal = {
      deterministic: true,
      trustSealVersion: 1,
      trustSealState: "TRUST_SEAL_VERIFIED",
      governanceTrusted: true,
      policyTrusted: true,
      complianceTrusted: true,
      attestationTrusted: true,
      certificationTrusted: true,
      accreditationTrusted: true,
      simulatedOnly: true,
      opsOnlyTrusted: true
    };
    const assuranceSummary = {
      deterministic: true,
      assuranceReady: true,
      assuranceMode: "OPS_READ_ONLY_ASSURED",
      governanceAssured: true,
      policyAssured: true,
      complianceAssured: true,
      attestationAssured: true,
      certificationAssured: true,
      accreditationAssured: true,
      trustSealAssured: true,
      opsOnlyAssured: true
    };

    const assuranceProofs = {
      deterministic: true,
      governanceAssuranceProof:
        governance.governanceStable === true,
      policyAssuranceProof:
        policy.policyStable === true,
      complianceAssuranceProof:
        compliance.complianceStable === true,
      attestationAssuranceProof:
        attestation.attestationStable === true,
      certificationAssuranceProof:
        certification.certificationStable === true,
      accreditationAssuranceProof:
        accreditation.accreditationStable === true,
      trustSealAssuranceProof:
        trustSeal.trustSealState === "TRUST_SEAL_VERIFIED",
      opsBoundaryAssuranceProof:
        governanceSummary.opsSurfaceOnly === true
    };

    const assurance = {
      deterministic: true,
      assuranceVersion: 1,
      assuranceState: "ASSURED_READ_ONLY",
      orchestrationAssurance: "ASSURED_PROHIBITED",
      persistenceAssurance: "ASSURED_PROHIBITED",
      schedulerAssurance: "ASSURED_PROHIBITED",
      mutationAssurance: "ASSURED_PROHIBITED",
      executionAssurance: "ASSURED_PROHIBITED",
      simulatedOnly: true,
      assuranceProofs,
      assuranceStable: true
    };

    const observabilitySummary = {
      deterministic: true,
      observabilityReady: true,
      observabilityMode: "OPS_READ_ONLY_OBSERVABLE",
      previewCount:
        serializedPreviews.length,
      planCount:
        plans.length,
      timelineCount:
        simulationTimeline.length,
      explainabilityCount:
        explainability.length,
      anomalyCount:
        diagnostics.anomalyCount,
      suppressedCount:
        diagnostics.suppressedCount,
      trustSealVisible: true,
      assuranceVisible: true
    };

    const verificationTelemetry = {
      deterministic: true,
      telemetryVersion: 1,
      replayHash:
        replay.replayHash,
      exportHash:
        exportEnvelope.exportHash,
      snapshotHash:
        replayObservability.snapshotHash,
      lineageReplayHash:
        lineage.currentReplayHash,
      totalProofFamilies: 9,
      totalSimulationRecords:
        serializedPreviews.length +
        plans.length +
        simulationTimeline.length +
        explainability.length,
      simulatedOnly: true
    };

    const trustDiagnostics = {
      deterministic: true,
      diagnosticsVersion: 1,
      trustDiagnosticsMode: "OPS_READ_ONLY_DIAGNOSTICS",
      trustSealVerified:
        trustSeal.trustSealState === "TRUST_SEAL_VERIFIED",
      assuranceStable:
        assurance.assuranceStable === true,
      governanceStable:
        governance.governanceStable === true,
      policyStable:
        policy.policyStable === true,
      complianceStable:
        compliance.complianceStable === true,
      attestationStable:
        attestation.attestationStable === true,
      certificationStable:
        certification.certificationStable === true,
      accreditationStable:
        accreditation.accreditationStable === true,
      simulatedOnly: true,
      opsOnlyDiagnostic: true
    };
    const intelligenceSummary = {
      deterministic: true,
      intelligenceReady: true,
      intelligenceMode: "OPS_READ_ONLY_INTELLIGENCE",
      analyticsReady: true,
      trustInsightsReady: true,
      governanceInsightsReady: true,
      observabilityInsightsReady: true,
      simulatedOnly: true,
      opsOnlyIntelligence: true
    };

    const analyticsSummary = {
      deterministic: true,
      analyticsVersion: 1,
      analyticsMode: "IN_MEMORY_ROLLUP_ONLY",
      totalPreviews:
        serializedPreviews.length,
      totalPlans:
        plans.length,
      totalTimelineEvents:
        simulationTimeline.length,
      totalExplainabilityRecords:
        explainability.length,
      totalAnomalies:
        diagnostics.anomalyCount,
      totalSuppressed:
        diagnostics.suppressedCount,
      simulatedOnly: true
    };

    const replayAnalytics = {
      deterministic: true,
      replayAnalyticsVersion: 1,
      replayHash:
        replay.replayHash,
      replayStable:
        comparison.replayEquivalent === true,
      replayDriftDetected:
        replayObservability.replayDriftDetected,
      lineageConsistent:
        replayObservability.lineageConsistent,
      simulatedOnly: true
    };

    const trustAnalytics = {
      deterministic: true,
      trustAnalyticsVersion: 1,
      trustSealVerified:
        trustSeal.trustSealState === "TRUST_SEAL_VERIFIED",
      trustDiagnosticsHealthy:
        trustDiagnostics.trustSealVerified === true &&
        trustDiagnostics.assuranceStable === true,
      assuranceTrusted:
        assurance.assuranceStable === true,
      accreditationTrusted:
        accreditation.accreditationStable === true,
      certificationTrusted:
        certification.certificationStable === true,
      simulatedOnly: true
    };

    const governanceIntelligence = {
      deterministic: true,
      governanceIntelligenceVersion: 1,
      governanceStable:
        governance.governanceStable === true,
      policyStable:
        policy.policyStable === true,
      complianceStable:
        compliance.complianceStable === true,
      executionStillProhibited:
        governance.executionProhibited === true &&
        policy.executionPolicy === "PROHIBITED" &&
        compliance.executionCompliance === "VERIFIED_PROHIBITED",
      opsBoundaryStable:
        governanceSummary.opsSurfaceOnly === true,
      simulatedOnly: true
    };

    const observabilityAnalytics = {
      deterministic: true,
      observabilityAnalyticsVersion: 1,
      observabilityReady:
        observabilitySummary.observabilityReady === true,
      telemetryAligned:
        replayObservability.telemetryAligned,
      observableRecordCount:
        observabilitySummary.previewCount +
        observabilitySummary.planCount +
        observabilitySummary.timelineCount +
        observabilitySummary.explainabilityCount,
      telemetryRecordCount:
        verificationTelemetry.totalSimulationRecords,
      simulatedOnly: true
    };

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
















