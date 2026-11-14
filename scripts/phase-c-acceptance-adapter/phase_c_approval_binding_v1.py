"""Offline GitHub evidence and durable reservation consistency check.

Input objects are untrusted until retrieved by an independent,
authenticated evidence reader. This never grants execution authority.
"""

from phase_c_operation_intent_v1 import (
    EXPECTED_SCOPE,
    assess_operation_intent,
)

REPOSITORY = "HOPEpicenter/hope-ai-api"
WORKFLOW = ".github/workflows/phase-c-protected-job-creation.yml"
ENVIRONMENT = "HOPE-Phase-C-Job-Creation"


def assess_approval_binding(
    ledger, operation_id, request_id, target_scope,
    run, job, approval,
):
    intent = assess_operation_intent(
        ledger, operation_id, request_id, target_scope
    )
    if intent != "TRUSTED_AUTHORITY_NOT_CONNECTED":
        return intent

    if type(run) is not dict:
        return "RUN_EVIDENCE_INVALID"

    repository = run.get("repository")
    if type(repository) is not dict:
        return "RUN_EVIDENCE_INVALID"

    if (
        repository.get("full_name") != REPOSITORY
        or run.get("path") != WORKFLOW
        or run.get("event") != "workflow_dispatch"
        or run.get("head_branch") != "main"
    ):
        return "WORKFLOW_IDENTITY_MISMATCH"

    if type(run.get("id")) is not int or run["id"] < 1:
        return "RUN_EVIDENCE_INVALID"

    if type(job) is not dict:
        return "JOB_EVIDENCE_INVALID"

    expected_name = (
        f"DISABLED operation={operation_id} request={request_id}"
    )

    if (
        job.get("run_id") != run["id"]
        or job.get("name") != expected_name
    ):
        return "JOB_OPERATION_BINDING_MISMATCH"

    if type(approval) is not dict:
        return "APPROVAL_EVIDENCE_INVALID"

    reviewer = approval.get("user")
    environments = approval.get("environments")

    if type(reviewer) is not dict or type(environments) is not list:
        return "APPROVAL_EVIDENCE_INVALID"

    if (
        approval.get("state") != "approved"
        or reviewer.get("login", "").lower() != "hope-2018"
        or not any(
            type(env) is dict and env.get("name") == ENVIRONMENT
            for env in environments
        )
    ):
        return "APPROVAL_BINDING_MISMATCH"

    # Matching records are not authenticated by this function.
    # No proof of complete approval history, unique use or issuer trust.
    return "EVIDENCE_CONSISTENT_NOT_AUTHORIZED"
