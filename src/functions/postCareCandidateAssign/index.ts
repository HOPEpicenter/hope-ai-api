import {
  requireCurrentRegistrationContactPermission,
  type RegistrationConsentReader
} from "../../services/followups/requireCurrentRegistrationContactPermission";
import { contactWriterHoldEnabled } from "../../services/followups/permanentVisitorContactWriterHold";
import { createPermanentVisitorConsentRepository } from "../../repositories/permanentVisitorConsentRepository";
import { getTableClient } from "../_shared/tableClient";
import { randomUUID } from "node:crypto";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureFormationTables,
  recordFormationEventV1,
  recordCommittedStaffCareAssignment,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateByVisitorId } from "../../services/care/readCareCandidateByVisitorId";
import { resolveMutationSource } from "../../services/events/resolveMutationSource";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import {
  requireCareOwnerActor,
  requireCareOwnerAssignee
} from "../_shared/careOwnerStaffActor";

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

export type CareAssignConsentDependencies = {
  requireActor?: typeof requireCareOwnerActor;
  requireAssignee?: typeof requireCareOwnerAssignee;
  getVisitor?: typeof getVisitorById;
  readRegistrationConsent?: RegistrationConsentReader;
};

export async function postCareCandidateAssign(
  context: any,
  req: any,
  dependencies: CareAssignConsentDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.log.warn("postCareCandidateAssign auth rejected");
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postCareCandidateAssign"
        }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    const assignedTo = String(req?.body?.assignedTo ?? "").trim();
    const eventId = String(req?.body?.eventId ?? "").trim() || randomUUID();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    if (!assignedTo) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "assignedTo is required" }
      };
      return;
    }

    const actorAuthorization =
      await (dependencies.requireActor ?? requireCareOwnerActor)(req);

    if (!actorAuthorization.ok) {
      context.res = {
        status: actorAuthorization.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...actorAuthorization.body,
          authRejectedBy: "postCareCandidateAssign"
        }
      };
      return;
    }

    const assigneeAuthorization =
      await (dependencies.requireAssignee ?? requireCareOwnerAssignee)(assignedTo);

    if (!assigneeAuthorization.ok) {
      context.res = {
        status: assigneeAuthorization.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: assigneeAuthorization.body
      };
      return;
    }

    const actorId = actorAuthorization.actor.staffId;

    if (contactWriterHoldEnabled() &&
        process.env.FEATURE_PERMANENT_VISITOR_CARE_ASSIGNMENT === "true") {

      const reply = (
        status: number,
        body: Record<string, unknown>
      ) => {
        context.res = {
          status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          },
          body: { ...body, requestId }
        };
      };

      const suppliedId = req?.body?.eventId;
      const expectedRevision = req?.body?.expectedConsentRevision;
      const validId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

      if (!validId.test(visitorId) ||
          !validId.test(actorId) ||
          !validId.test(assignedTo) ||
          typeof suppliedId !== "string" ||
          !uuid.test(suppliedId) ||
          typeof expectedRevision !== "number" ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 1) {
        reply(400, {
          ok: false,
          error: "Invalid protected Care assignment request"
        });
        return;
      }

      const cutover =
        process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER;

      if (!cutover ||
          !Number.isFinite(Date.parse(cutover)) ||
          new Date(cutover).toISOString() !== cutover) {
        reply(503, {
          ok: false,
          error: "Care consent authority unavailable"
        });
        return;
      }

      const visitor = await (
        dependencies.getVisitor ?? getVisitorById
      )(visitorId);

      if (!visitor) {
        reply(404, {
          ok: false,
          error: "Visitor not found"
        });
        return;
      }

      const repository = createPermanentVisitorConsentRepository(
        getTableClient("VisitorFollowupEvents"), true
      );

      const current = await repository.read(visitorId);

      if (current.status !== "ready") {
        reply(503, {
          ok: false,
          error: "Care consent authority unavailable"
        });
        return;
      }

      if (current.state.effective !== "granted" ||
          current.state.pending !== null ||
          current.state.revision !== expectedRevision) {
        reply(409, {
          ok: false,
          error: "Current visitor permission requires review"
        });
        return;
      }

      const assignment =
        await repository.appendStaffCareAssignment(
          visitorId, {
            operationId: suppliedId,
            actorId,
            assigneeId: assignedTo,
            expectedRevision
          }
        );

      if (assignment.status !== "committed" &&
          assignment.status !== "replayed") {

        const status =
          assignment.status === "invalid" ? 400 :
          assignment.status === "unavailable" ? 503 : 409;

        reply(status, {
          ok: false,
          error: "Care assignment could not be confirmed"
        });
        return;
      }

      try {
        const synchronized =
          await recordCommittedStaffCareAssignment(
            visitorId, suppliedId
          );

        // Historical recovery is not evidence of current
        // permission. Recheck before exposing actionable care.
        const latest = await repository.read(visitorId);

        if (latest.status !== "ready" ||
            latest.state.effective !== "granted" ||
            latest.state.pending !== null ||
            latest.state.revision !== expectedRevision) {
          reply(409, {
            ok: false,
            error: "Care assignment recorded; permission requires review",
            operationId: suppliedId
          });
          return;
        }

        const result = readCareCandidateByVisitorId({
          visitorId,
          profiles: [toCareProfileInput(synchronized.profile)]
        });

        reply(200, {
          ok: true,
          operationId: suppliedId,
          found: result.found,
          item: result.item
        });
      } catch {
        // Never claim success for an incomplete projection.
        // Recovery must use the exact original operation ID.
        reply(503, {
          ok: false,
          error: "Care assignment synchronization requires reconciliation",
          operationId: suppliedId
        });
      }

      return;
    }

    const consentFailure = await requireCurrentRegistrationContactPermission(
      visitorId, dependencies.readRegistrationConsent
    );
    if (consentFailure) {
      context.res = {
        status: consentFailure.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: { ok: false, requestId, error: consentFailure.error }
      };
      return;
    }

    const visitor = await (dependencies.getVisitor ?? getVisitorById)(visitorId);

    if (!visitor) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "not found" }
      };
      return;
    }

    await ensureFormationTables();

    const latestConsentFailure = await requireCurrentRegistrationContactPermission(
      visitorId, dependencies.readRegistrationConsent
    );
    if (latestConsentFailure) {
      context.res = {
        status: latestConsentFailure.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: { ok: false, requestId, error: latestConsentFailure.error }
      };
      return;
    }

    const eventResult = await recordFormationEventV1({
      v: 1,
      eventId,
      visitorId,
      type: "FOLLOWUP_ASSIGNED",
      occurredAt: new Date().toISOString(),
      source: resolveMutationSource({
        system: "hope-dashboard-next",
        actorId
      }),
      data: {
        assigneeId: assignedTo
      }
    });

    const result = readCareCandidateByVisitorId({
      visitorId,
      profiles: [toCareProfileInput(eventResult.profile)]
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        found: result.found,
        item: result.item
      }
    };
  } catch (err: any) {
    logFunctionError(context, "postCareCandidateAssign", err, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "POST_CARE_CANDIDATE_ASSIGN_FAILED",
        "Unexpected care candidate assignment error",
        requestId
      )
    };
  }
}
