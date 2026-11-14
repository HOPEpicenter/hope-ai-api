"""Validate untrusted structured GitHub evidence against a local reservation.

No GitHub calls, ledger writes, issuer trust, or execution authority.
"""

import json

from phase_c_approval_binding_v1 import assess_complete_approval_history


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_JSON_FIELD")
        result[key] = value
    return result


def assess_github_evidence_json(
    ledger, operation_id, request_id, target_scope, evidence_json
):
    if type(evidence_json) is not str:
        return "EVIDENCE_JSON_INVALID"

    try:
        evidence = json.loads(
            evidence_json, object_pairs_hook=_unique_object
        )
    except (ValueError, TypeError):
        return "EVIDENCE_JSON_INVALID"

    if type(evidence) is not dict:
        return "EVIDENCE_JSON_INVALID"

    if evidence.get("schema") != "phase-c-github-evidence-v1":
        return "EVIDENCE_SCHEMA_INVALID"

    if (
        evidence.get("operationId") != operation_id
        or evidence.get("requestId") != request_id
    ):
        return "EVIDENCE_OPERATION_BINDING_MISMATCH"

    if (
        evidence.get("executionAuthorized") is not False
        or evidence.get("trustedIssuerConnected") is not False
    ):
        return "EVIDENCE_AUTHORITY_FENCE_INVALID"

    run = evidence.get("run")
    job = evidence.get("job")
    history = evidence.get("history")
    run_id = evidence.get("runId")

    if (
        type(run) is not dict
        or type(run_id) is not int
        or run_id < 1
        or type(run.get("id")) is not int
        or run["id"] != run_id
        or type(job) is not dict
        or type(history) is not list
    ):
        return "EVIDENCE_STRUCTURE_INVALID"

    return assess_complete_approval_history(
        ledger, operation_id, request_id, target_scope,
        run, job, history
    )
