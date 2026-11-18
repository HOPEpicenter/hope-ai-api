import unittest

from phase_c_acceptance_integration_v2 import (
    simulate_transaction,
    simulate_lifecycle,
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


    def test_lifecycle_cleanup_after_success(self):
        events = []

        result = simulate_lifecycle(
            lambda: "TEST_KEY",
            lambda key: ["HTTP_STATUS=200"],
            lambda: events.append("cleanup"),
            lambda: events == ["cleanup"],
        )

        self.assertEqual(result, "ACCEPTANCE_PASSED")

    def test_lifecycle_cleanup_after_credential_failure(self):
        events = []

        def acquire():
            raise RuntimeError("SYNTHETIC_SECRET")

        result = simulate_lifecycle(
            acquire,
            lambda key: ["HTTP_STATUS=200"],
            lambda: events.append("cleanup"),
            lambda: events == ["cleanup"],
        )

        self.assertEqual(result, "CREDENTIAL_ACQUISITION_FAILED")

    def test_lifecycle_cleanup_after_wrapper_failure(self):
        events = []

        def run(key):
            raise RuntimeError("SYNTHETIC_SECRET")

        result = simulate_lifecycle(
            lambda: "TEST_KEY",
            run,
            lambda: events.append("cleanup"),
            lambda: events == ["cleanup"],
        )

        self.assertEqual(result, "EXECUTION_FAILURE")

    def test_lifecycle_cleanup_failure_blocks_success(self):
        def cleanup():
            raise RuntimeError("SYNTHETIC_SECRET")

        result = simulate_lifecycle(
            lambda: "TEST_KEY",
            lambda key: ["HTTP_STATUS=200"],
            cleanup,
            lambda: True,
        )

        self.assertEqual(result, "CLEANUP_FAILED")

    def test_lifecycle_unverified_cleanup_blocks_success(self):
        result = simulate_lifecycle(
            lambda: "TEST_KEY",
            lambda key: ["HTTP_STATUS=200"],
            lambda: None,
            lambda: False,
        )

        self.assertEqual(result, "CLEANUP_NOT_VERIFIED")

    def test_lifecycle_verification_exception_blocks_success(self):
        def verify():
            raise RuntimeError("SYNTHETIC_SECRET")

        result = simulate_lifecycle(
            lambda: "TEST_KEY",
            lambda key: ["HTTP_STATUS=200"],
            lambda: None,
            verify,
        )

        self.assertEqual(result, "CLEANUP_NOT_VERIFIED")

if __name__ == "__main__":
    unittest.main()