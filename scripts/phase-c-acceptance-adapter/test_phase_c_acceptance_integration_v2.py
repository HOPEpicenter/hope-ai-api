import unittest

from phase_c_acceptance_integration_v2 import (
    simulate_transaction,
    execution_authorized,
)


class SyntheticIntegrationTests(unittest.TestCase):

    def test_success(self):
        result = simulate_transaction(
            lambda: "SYNTHETIC_KEY",
            lambda key: ["HTTP_STATUS=200"],
        )
        self.assertEqual(result, "ACCEPTANCE_PASSED")

    def test_credential_failure_contained(self):
        def fail():
            raise RuntimeError("SYNTHETIC_SECRET_MARKER")

        self.assertEqual(
            simulate_transaction(fail, lambda key: []),
            "CREDENTIAL_ACQUISITION_FAILED",
        )

    def test_wrapper_failure_contained(self):
        def fail(key):
            raise RuntimeError("SYNTHETIC_SECRET_MARKER")

        self.assertEqual(
            simulate_transaction(lambda: "TEST", fail),
            "EXECUTION_FAILURE",
        )

    def test_redirect_rejected(self):
        self.assertEqual(
            simulate_transaction(
                lambda: "TEST",
                lambda key: ["HTTP_STATUS=302"],
            ),
            "ACCEPTANCE_FAILED",
        )

    def test_unauthorized_rejected(self):
        self.assertEqual(
            simulate_transaction(
                lambda: "TEST",
                lambda key: ["HTTP_STATUS=403"],
            ),
            "ACCEPTANCE_FAILED",
        )

    def test_sensitive_output_rejected(self):
        self.assertEqual(
            simulate_transaction(
                lambda: "TEST",
                lambda key: [
                    "HTTP_STATUS=200",
                    "API_KEY=SYNTHETIC_SECRET_MARKER",
                ],
            ),
            "INVALID_EVIDENCE",
        )

    def test_failure_marker_rejects_success(self):
        self.assertEqual(
            simulate_transaction(
                lambda: "TEST",
                lambda key: [
                    "HTTP_STATUS=200",
                    "FAILURE_CATEGORY=AUTHORIZATION",
                ],
            ),
            "ACCEPTANCE_FAILED",
        )

    def test_live_execution_disabled(self):
        self.assertFalse(execution_authorized())



    def test_missing_key_rejected(self):
        self.assertEqual(
            simulate_transaction(lambda: None, lambda key: ["HTTP_STATUS=200"]),
            "CREDENTIAL_ACQUISITION_FAILED",
        )

    def test_empty_key_rejected(self):
        self.assertEqual(
            simulate_transaction(lambda: "", lambda key: ["HTTP_STATUS=200"]),
            "CREDENTIAL_ACQUISITION_FAILED",
        )

    def test_wrapper_not_called_without_key(self):
        invoked = []
        result = simulate_transaction(
            lambda: None,
            lambda key: invoked.append(True),
        )
        self.assertEqual(result, "CREDENTIAL_ACQUISITION_FAILED")
        self.assertEqual(invoked, [])

    def test_keyboard_interrupt_not_swallowed(self):
        def interrupt():
            raise KeyboardInterrupt()

        with self.assertRaises(KeyboardInterrupt):
            simulate_transaction(interrupt, lambda key: [])

if __name__ == "__main__":
    unittest.main()