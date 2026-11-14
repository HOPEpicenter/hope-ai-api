"""Synthetic-only Phase C recovery decision security tests."""

import unittest

from phase_c_recovery_decision_v1 import (
    RecoveryEvidence,
    assess_recovery,
)


def verified():
    return RecoveryEvidence(True, True, True, True)


class RecoveryDecisionTests(unittest.TestCase):

    def test_full_success(self):
        result = assess_recovery(True, verified())
        self.assertTrue(result.accepted)
        self.assertEqual(
            result.code, "RECOVERY_CONTRACT_SATISFIED"
        )

    def test_failed_acceptance(self):
        result = assess_recovery(False, verified())
        self.assertFalse(result.accepted)
        self.assertEqual(
            result.code, "ACCEPTANCE_NOT_SUCCESSFUL"
        )

    def test_missing_evidence(self):
        result = assess_recovery(True, None)
        self.assertFalse(result.accepted)

    def test_vm_still_running(self):
        evidence = RecoveryEvidence(False, True, True, True)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)
        self.assertEqual(
            result.code, "VM_NOT_VERIFIED_DEALLOCATED"
        )

    def test_run_commands_not_empty(self):
        evidence = RecoveryEvidence(True, False, True, True)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)

    def test_permissions_not_revoked(self):
        evidence = RecoveryEvidence(True, True, False, True)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)
        self.assertEqual(
            result.code,
            "TEMPORARY_PERMISSIONS_NOT_VERIFIED_REVOKED",
        )

    def test_journal_not_verified(self):
        evidence = RecoveryEvidence(True, True, True, False)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)

    def test_unknown_value_denied(self):
        evidence = RecoveryEvidence(True, True, None, True)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)

    def test_truthy_nonboolean_denied(self):
        evidence = RecoveryEvidence(1, True, True, True)
        result = assess_recovery(True, evidence)
        self.assertFalse(result.accepted)

    def test_untrusted_mapping_denied(self):
        result = assess_recovery(
            True,
            {
                "vm_deallocated": True,
                "managed_commands_empty": True,
                "temporary_permissions_revoked": True,
                "recovery_journal_verified": True,
            },
        )
        self.assertFalse(result.accepted)


if __name__ == "__main__":
    unittest.main()