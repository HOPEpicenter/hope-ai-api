"""Synthetic scheduling tests; no Azure or live recovery."""

import unittest

from phase_c_recovery_schedule_v1 import (
    assess_recovery_schedule,
)


class RecoveryScheduleTests(unittest.TestCase):

    def snapshot(
        self,
        state="RECOVERY_REQUIRED",
        deadline=2000,
        lease=None,
        attempts=0,
    ):
        return {
            "state": state,
            "deadline_utc": deadline,
            "lease_until_utc": lease,
            "attempts": attempts,
        }

    def test_pending_work_is_eligible(self):
        result = assess_recovery_schedule(
            self.snapshot(), 1000
        )
        self.assertEqual(result.code, "RECOVERY_DUE")
        self.assertTrue(result.claim_eligible)
        self.assertFalse(result.deadline_exceeded)

    def test_expired_deadline_is_visible(self):
        result = assess_recovery_schedule(
            self.snapshot(), 2000
        )
        self.assertTrue(result.deadline_exceeded)
        self.assertTrue(result.claim_eligible)

    def test_active_lease_blocks_claim(self):
        result = assess_recovery_schedule(
            self.snapshot(
                "RECOVERY_IN_PROGRESS", 2000, 1100, 1
            ),
            1000,
        )
        self.assertFalse(result.claim_eligible)
        self.assertEqual(result.next_check_utc, 1100)

    def test_expired_lease_is_reclaimable(self):
        result = assess_recovery_schedule(
            self.snapshot(
                "RECOVERY_IN_PROGRESS", 2000, 1000, 1
            ),
            1000,
        )
        self.assertEqual(
            result.code, "STALE_LEASE_RECLAIMABLE"
        )
        self.assertTrue(result.claim_eligible)

    def test_invalid_input_fails_closed(self):
        invalid = [
            None,
            {},
            self.snapshot(state="COMPLETE"),
            self.snapshot(lease=1000),
            self.snapshot(attempts=-1),
            self.snapshot(deadline=True),
            self.snapshot(
                state="RECOVERY_IN_PROGRESS",
                lease=None,
                attempts=1,
            ),
            self.snapshot(
                state="RECOVERY_IN_PROGRESS",
                lease=1100,
                attempts=0,
            ),
        ]
        for item in invalid:
            with self.subTest(item=item):
                result = assess_recovery_schedule(item, 1000)
                self.assertFalse(result.claim_eligible)
                self.assertEqual(
                    result.code, "SCHEDULE_UNAVAILABLE"
                )

    def test_invalid_clock_fails_closed(self):
        for now in (-1, True, "1000", None):
            with self.subTest(now=now):
                result = assess_recovery_schedule(
                    self.snapshot(), now
                )
                self.assertFalse(result.claim_eligible)


if __name__ == "__main__":
    unittest.main()
