"""Phase C acceptance adapter foundation.

Preparation only. No bridge import, credential acquisition,
network request, Azure operation, or live execution.
"""

import argparse
import re

from phase_c_authorization_gate_v1 import assess_execution_request

_FAILURE = re.compile(r"FAILURE_CATEGORY=[A-Z0-9_]+", re.ASCII)
_STATUS = re.compile(r"HTTP_STATUS=(UNAVAILABLE|[1-5][0-9]{2})", re.ASCII)


def classify_output(lines):
    """Classify already-produced status-only evidence."""

    if not isinstance(lines, (list, tuple)):
        return "INVALID_EVIDENCE"

    if not lines or len(lines) > 2:
        return "INVALID_EVIDENCE"

    statuses = []
    failures = []

    for line in lines:
        if not isinstance(line, str):
            return "INVALID_EVIDENCE"

        if len(line) > 80 or "\n" in line or "\r" in line:
            return "INVALID_EVIDENCE"

        if _STATUS.fullmatch(line):
            statuses.append(line.split("=", 1)[1])
        elif _FAILURE.fullmatch(line):
            failures.append(line.split("=", 1)[1])
        else:
            return "INVALID_EVIDENCE"

    if len(statuses) != 1 or len(failures) > 1:
        return "INVALID_EVIDENCE"

    if statuses[0] == "200" and not failures:
        return "ACCEPTANCE_PASSED"

    return "ACCEPTANCE_FAILED"


def classify_exception(_exception=None):
    """Never expose exception messages or representations."""
    return "EXECUTION_FAILURE"


def execute_live():
    """Consult the default-deny gate; no live bridge is connected."""
    return assess_execution_request(execute=True)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="HOPE Phase C preparation-only adapter"
    )
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)

    if args.execute:
        print("FAILURE_CATEGORY=" + assess_execution_request(execute=True))
        return 2

    print("FAILURE_CATEGORY=DEFAULT_DISABLED")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())