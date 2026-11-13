"""Phase C Azure recovery verifier regressions.

Never invoke -Inspect. No Azure access, credentials, or mutations.
"""

import pathlib
import re
import shutil
import subprocess
import unittest

SCRIPT = pathlib.Path(__file__).resolve().with_name(
    "Verify-PhaseCAcceptanceRecoveryState-v1.ps1"
)


class PhaseCRecoveryVerifierTests(unittest.TestCase):

    def test_default_disabled_without_azure_access(self):
        pwsh = shutil.which("pwsh")
        self.assertIsNotNone(pwsh)

        result = subprocess.run(
            [pwsh, "-NoProfile", "-NonInteractive",
             "-File", str(SCRIPT)],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertEqual(
            result.stdout.strip(),
            "RECOVERY_INSPECTION=DEFAULT_DISABLED",
        )
        self.assertEqual(result.stderr.strip(), "")

    def test_read_only_azure_command_inventory(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        calls = re.findall(
            r"(?m)^\s*(?:\$\w+\s*=\s*)?&\s+az\s+"
            r"([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){1,3})",
            text,
        )

        self.assertEqual(len(calls), 3)
        self.assertTrue(any(c.startswith("account show") for c in calls))
        self.assertTrue(any(c.startswith("vm get-instance-view") for c in calls))
        self.assertTrue(any(c.startswith("vm run-command list") for c in calls))

        forbidden = (
            "vm start",
            "vm deallocate",
            "run-command create",
            "run-command delete",
            "role assignment create",
            "role assignment delete",
        )

        for command in calls:
            for marker in forbidden:
                with self.subTest(command=command, marker=marker):
                    self.assertNotIn(marker, command)

    def test_exact_isolated_scope(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        self.assertIn(
            "fbafd6e4-21ad-41d9-8f98-091c3c73ded2", text
        )
        self.assertIn("rg-hope-ai-api-staging", text)
        self.assertIn("vm-hope-c6-acceptance", text)
        self.assertIn(
            "FULL_TRANSACTION_CLEANUP_VERIFIED=False", text
        )

    def test_strict_mode_safe_optional_status_fields(self):
        text = SCRIPT.read_text(encoding="utf-8-sig")

        self.assertIn(
            "$vm.PSObject.Properties['statuses']", text
        )
        self.assertIn(
            "$vm.PSObject.Properties['instanceView']", text
        )
        self.assertNotIn("$vm.statuses", text)
        self.assertNotIn("$vm.instanceView.statuses", text)


if __name__ == "__main__":
    unittest.main()