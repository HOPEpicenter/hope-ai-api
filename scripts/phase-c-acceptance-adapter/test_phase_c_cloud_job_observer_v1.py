"""Phase C cloud observer security regressions.

Do not invoke -Inspect or authenticate to Azure.
"""

import pathlib
import shutil
import subprocess
import unittest


SCRIPT = pathlib.Path(__file__).resolve().with_name(
    "Watch-PhaseCRecoveryJob-v1.ps1"
)


class PhaseCCloudObserverTests(unittest.TestCase):

    def source(self):
        return SCRIPT.read_text(encoding="utf-8-sig")

    def test_default_disabled_without_azure(self):
        pwsh = shutil.which("pwsh")
        self.assertIsNotNone(pwsh)

        result = subprocess.run(
            [
                pwsh,
                "-NoProfile",
                "-NonInteractive",
                "-File",
                str(SCRIPT),
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )

        self.assertEqual(result.returncode, 2)
        self.assertEqual(
            result.stdout.strip(),
            "PHASE_C_CLOUD_OBSERVER=DEFAULT_DISABLED",
        )
        self.assertEqual(result.stderr.strip(), "")

    def test_managed_identity_only(self):
        source = self.source()
        self.assertIn("Connect-AzAccount -Identity", source)
        self.assertNotIn("Connect-AzAccount -Credential", source)
        self.assertNotIn("Get-AutomationPSCredential", source)

    def test_exact_isolated_scope(self):
        source = self.source()
        self.assertIn(
            "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
            source,
        )
        self.assertIn("rg-hope-ai-api-staging", source)
        self.assertIn("aa-hope-e156-cleanup", source)
        self.assertIn("Test-CanonicalUuid4 $JobId", source)

    def test_only_read_only_rest_operation(self):
        source = self.source()

        self.assertEqual(
            source.count("Invoke-AzRestMethod"), 1
        )
        self.assertIn("-Method GET", source)

        for prohibited in (
            "-Method POST",
            "-Method PUT",
            "-Method PATCH",
            "-Method DELETE",
            "Start-AzAutomationRunbook",
            "Remove-AzRoleAssignment",
            "Start-AzVM",
        ):
            with self.subTest(prohibited=prohibited):
                self.assertNotIn(prohibited, source)

    def test_cannot_assert_cleanup_success(self):
        source = self.source()

        self.assertIn(
            "FULL_TRANSACTION_CLEANUP_VERIFIED=False",
            source,
        )
        self.assertIn(
            "JOB_OPERATION_BINDING=NOT_VERIFIED",
            source,
        )
        self.assertIn(
            "RECOVERY_EXECUTION=DISABLED",
            source,
        )
        self.assertNotIn(
            "FULL_TRANSACTION_CLEANUP_VERIFIED=True",
            source,
        )

    def test_unknown_job_state_fails_closed(self):
        source = self.source()
        self.assertIn(
            "throw 'UNKNOWN_JOB_STATUS'",
            source,
        )
        self.assertIn(
            "JOB_OBSERVATION=UNAVAILABLE",
            source,
        )


if __name__ == "__main__":
    unittest.main()
