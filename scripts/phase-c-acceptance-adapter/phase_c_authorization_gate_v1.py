"""Phase C trusted authorization gate.

This preparation-only module never authorizes live execution.

Future execution must depend on a separately implemented and
verified external trust boundary, not caller-supplied flags,
environment variables, or self-declared approval receipts.
"""

DENIAL = "LIVE_EXECUTION_NOT_AUTHORIZED"


def assess_execution_request(
    *,
    execute=False,
    approval=None,
    environment=None,
):
    """Return a fixed denial for every untrusted local request.

    Input parameters intentionally cannot grant authority.
    """

    return DENIAL


def require_execution_authorization(**kwargs):
    """Fail closed without exposing supplied authorization material."""
    raise PermissionError(DENIAL)


def trusted_verifier_available():
    """No trusted external verifier is connected in this version."""
    return False