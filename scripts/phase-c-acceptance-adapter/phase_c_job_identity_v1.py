"""Offline Phase C Azure Automation job identity assessment.

Matches metadata structure only. No ARM calls, Azure execution,
trusted provenance, or operation authorization.
"""

import uuid

SUBSCRIPTION = "fbafd6e4-21ad-41d9-8f98-091c3c73ded2"
RESOURCE_GROUP = "rg-hope-ai-api-staging"
AUTOMATION_ACCOUNT = "aa-hope-e156-cleanup"
RUNBOOK = "Remove-HopeE156TemporaryNetwork-v14"


def _canonical_uuid4(value):
    if type(value) is not str:
        return False
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        return False
    return parsed.version == 4 and str(parsed) == value


def assess_job_identity(request_id, job):
    """Compare an untrusted job record to a reserved request ID."""

    if not _canonical_uuid4(request_id):
        return "INVALID_REQUEST_ID"

    if type(job) is not dict:
        return "JOB_METADATA_INVALID"

    expected_id = (
        f"/subscriptions/{SUBSCRIPTION}"
        f"/resourceGroups/{RESOURCE_GROUP}"
        "/providers/Microsoft.Automation"
        f"/automationAccounts/{AUTOMATION_ACCOUNT}"
        f"/jobs/{request_id}"
    )

    if job.get("id") != expected_id:
        return "JOB_IDENTITY_MISMATCH"

    if job.get("name") != request_id:
        return "JOB_NAME_MISMATCH"

    properties = job.get("properties")
    if type(properties) is not dict:
        return "JOB_METADATA_INVALID"

    runbook = properties.get("runbook")
    if type(runbook) is not dict:
        return "JOB_METADATA_INVALID"

    if runbook.get("name") != RUNBOOK:
        return "JOB_RUNBOOK_MISMATCH"

    # Matching caller-supplied metadata does not authenticate Azure
    # provenance or prove recovery-operation ownership.
    return "JOB_IDENTITY_MATCHED_UNVERIFIED"
