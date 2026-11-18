/**
 * Phase C independent issuer approval-evidence consistency.
 *
 * All inputs are UNTRUSTED. This module does not retrieve
 * authenticated GitHub history, validate durable reservations,
 * establish workload identity, or authorize issuance/execution.
 */

const REPOSITORY = "HOPEpicenter/hope-ai-api";
const WORKFLOW =
  ".github/workflows/phase-c-protected-job-creation.yml";
const ENVIRONMENT = "HOPE-Phase-C-Job-Creation";
const REVIEWER = "hope-2018";

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PhaseCIssuerApprovalAssessment = Readonly<{
  status:
    | "invalid"
    | "workflow_mismatch"
    | "job_mismatch"
    | "approval_rejected"
    | "approval_not_unique"
    | "evidence_consistent_not_authenticated";
  evidenceAuthenticated: false;
  issuanceAuthorized: false;
  executionAuthorized: false;
  retryAuthorized: false;
}>;

type Status = PhaseCIssuerApprovalAssessment["status"];

function result(status: Status): PhaseCIssuerApprovalAssessment {
  return {
    status,
    evidenceAuthenticated: false,
    issuanceAuthorized: false,
    executionAuthorized: false,
    retryAuthorized: false
  };
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exactText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value;
}

function environmentsValid(value: unknown): value is Array<{
  name: string;
}> {
  return Array.isArray(value) && value.every(item => {
    const entry = record(item);
    return entry !== null && exactText(entry.name);
  });
}

/**
 * Shape and consistency only, never proof of approval.
 * Protected infrastructure must independently obtain complete
 * authenticated history and validate current operation policy.
 */
export function assessPhaseCIssuerApprovalEvidence(
  input: unknown
): PhaseCIssuerApprovalAssessment {
  const data = record(input);
  if (!data) return result("invalid");

  const operationId = data.operationId;
  const requestId = data.requestId;
  const run = record(data.run);
  const job = record(data.job);
  const history = data.history;

  if (
    typeof operationId !== "string" ||
    !UUID4.test(operationId) ||
    typeof requestId !== "string" ||
    !UUID4.test(requestId) ||
    operationId === requestId ||
    !run ||
    !job ||
    !Array.isArray(history) ||
    history.length === 0
  ) {
    return result("invalid");
  }

  const repository = record(run.repository);

  if (
    !repository ||
    repository.full_name !== REPOSITORY ||
    run.path !== WORKFLOW ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main"
  ) {
    return result("workflow_mismatch");
  }

  if (
    !Number.isSafeInteger(run.id) ||
    (run.id as number) < 1
  ) {
    return result("invalid");
  }

  if (
    job.run_id !== run.id ||
    job.name !==
      `DISABLED operation=${operationId} request=${requestId}`
  ) {
    return result("job_mismatch");
  }

  let approvals = 0;
  let rejected = false;

  for (const item of history) {
    const approval = record(item);
    if (!approval) return result("invalid");

    const user = record(approval.user);

    if (
      !user ||
      !exactText(user.login) ||
      !exactText(approval.state) ||
      !environmentsValid(approval.environments)
    ) {
      return result("invalid");
    }

    const protectedEnvironment =
      approval.environments.some(
        (env: { name: string }) => env.name === ENVIRONMENT
      );

    if (!protectedEnvironment) continue;

    if (approval.state === "rejected") {
      rejected = true;
    }

    if (
      approval.state === "approved" &&
      (user.login as string).toLowerCase() === REVIEWER
    ) {
      approvals++;
    }
  }

  // Order-independent rejection precedence.
  if (rejected) return result("approval_rejected");

  if (approvals !== 1) {
    return result("approval_not_unique");
  }

  // No caller-provided evidence can authorize issuance.
  return result("evidence_consistent_not_authenticated");
}