"""Security regressions for the disabled-only Phase C workflow.

Static checks only. No YAML execution, GitHub API calls, Azure calls,
credential access, or bridge execution.
"""

import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/phase-c-private-acceptance.yml"


def workflow_text():
    return WORKFLOW.read_text(encoding="utf-8-sig")


def has_line(text, line):
    return line in text.splitlines()


class PhaseCPrivateAcceptanceWorkflowTests(unittest.TestCase):

    def test_only_manual_disabled_mode(self):
        text = workflow_text()
        self.assertRegex(text, r"(?m)^on:\s*$")
        self.assertRegex(text, r"(?m)^  workflow_dispatch:\s*$")
        self.assertTrue(has_line(text, "          - disabled"))
        self.assertNotRegex(
            text,
            r"(?m)^  (push|pull_request|schedule|repository_dispatch|workflow_run):"
        )

    def test_main_branch_and_disabled_input_required(self):
        text = workflow_text()
        self.assertIn(
            "github.ref == 'refs/heads/main'", text
        )
        self.assertIn(
            "inputs.acceptance_mode == 'disabled'", text
        )
        self.assertIn(
            "github.event_name == 'workflow_dispatch'", text
        )

    def test_read_only_github_permissions(self):
        text = workflow_text()
        self.assertTrue(has_line(text, "permissions:"))
        self.assertTrue(has_line(text, "  contents: read"))
        self.assertNotIn("id-token: write", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("actions: write", text)

    def test_no_azure_or_bridge_execution(self):
        text = workflow_text().lower()
        prohibited = (
            "azure/login",
            "az login",
            "az vm ",
            "az role assignment",
            "hope_api_key",
            "execute_approved_wrapper",
            "private_api_key(",
            "staff-identities/entra/",
        )
        for marker in prohibited:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, text)

    def test_no_protected_environment_claimed(self):
        text = workflow_text()
        self.assertNotRegex(
            text, r"(?m)^\s*environment:\s*"
        )
        self.assertIn(
            "EXTERNAL_AUTHORIZATION_CONNECTED=False", text
        )
        self.assertIn(
            "PHASE_C_ACCEPTANCE=DISABLED", text
        )

    def test_serialized_and_time_bounded(self):
        text = workflow_text()
        self.assertTrue(
            has_line(text, "  group: phase-c-private-acceptance")
        )
        self.assertTrue(
            has_line(text, "  cancel-in-progress: false")
        )
        self.assertTrue(
            has_line(text, "    timeout-minutes: 5")
        )


if __name__ == "__main__":
    unittest.main()