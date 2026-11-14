"""Durable Phase C recovery coordination.

No Azure operations, credentials, live execution, or success transitions.
The ledger is not an independent recovery controller or trusted evidence
source. Only opaque UUIDs and lifecycle metadata may be stored.
"""

import sqlite3
from contextlib import closing
import uuid
from pathlib import Path


class RecoveryLedger:
    def __init__(self, path):
        self.path = str(Path(path))

        with closing(self._connect()) as db, db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS operations (
                    operation_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL
                        CHECK (state IN (
                            'RECOVERY_REQUIRED',
                            'RECOVERY_IN_PROGRESS'
                        )),
                    deadline_utc INTEGER NOT NULL,
                    lease_until_utc INTEGER,
                    attempt_id TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0
                )
            """)

            db.execute("""
                CREATE TABLE IF NOT EXISTS job_observations (
                    operation_id TEXT NOT NULL,
                    job_id TEXT NOT NULL UNIQUE,
                    PRIMARY KEY (operation_id, job_id),
                    FOREIGN KEY (operation_id)
                        REFERENCES operations(operation_id)
                )
            """)

            db.execute("""
                CREATE TABLE IF NOT EXISTS job_creation_reservations (
                    operation_id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL UNIQUE,
                    created_utc INTEGER NOT NULL,
                    state TEXT NOT NULL DEFAULT 'UNRESOLVED'
                        CHECK (state = 'UNRESOLVED'),
                    FOREIGN KEY (operation_id)
                        REFERENCES operations(operation_id)
                )
            """)

    def _connect(self):
        db = sqlite3.connect(
            self.path,
            timeout=5,
            isolation_level=None,
        )
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA busy_timeout=5000")
        return db

    @staticmethod
    def _require_uuid(value):
        if type(value) is not str:
            raise ValueError("INVALID_OPERATION_ID")
        parsed = uuid.UUID(value)
        if parsed.version != 4 or str(parsed) != value:
            raise ValueError("INVALID_OPERATION_ID")
        return value

    @staticmethod
    def _require_time(value):
        if type(value) is not int or value < 0:
            raise ValueError("INVALID_TIME")
        return value

    def register(self, operation_id, deadline_utc):
        self._require_uuid(operation_id)
        self._require_time(deadline_utc)

        with closing(self._connect()) as db, db:
            db.execute(
                "BEGIN IMMEDIATE"
            )
            db.execute(
                """
                INSERT INTO operations
                    (operation_id, state, deadline_utc)
                VALUES (?, 'RECOVERY_REQUIRED', ?)
                """,
                (operation_id, deadline_utc),
            )
            db.commit()

    def snapshot(self, operation_id):
        self._require_uuid(operation_id)

        with closing(self._connect()) as db, db:
            row = db.execute(
                """
                SELECT state, deadline_utc, lease_until_utc,
                       attempts
                FROM operations
                WHERE operation_id = ?
                """,
                (operation_id,),
            ).fetchone()

        if row is None:
            return None

        return {
            "state": row[0],
            "deadline_utc": row[1],
            "lease_until_utc": row[2],
            "attempts": row[3],
        }

    def claim_recovery(self, operation_id, now_utc, lease_seconds=60):
        """Atomically claim or reclaim an expired recovery lease.

        This is coordination only: it grants no Azure authority.
        """
        self._require_uuid(operation_id)
        self._require_time(now_utc)

        if (type(lease_seconds) is not int or
                not 1 <= lease_seconds <= 300):
            raise ValueError("INVALID_LEASE_DURATION")

        attempt_id = str(uuid.uuid4())

        with closing(self._connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")

            cursor = db.execute(
                """
                UPDATE operations
                SET state = 'RECOVERY_IN_PROGRESS',
                    lease_until_utc = ?,
                    attempt_id = ?,
                    attempts = attempts + 1
                WHERE operation_id = ?
                  AND (
                      state = 'RECOVERY_REQUIRED'
                      OR (
                          state = 'RECOVERY_IN_PROGRESS'
                          AND lease_until_utc <= ?
                      )
                  )
                """,
                (
                    now_utc + lease_seconds,
                    attempt_id,
                    operation_id,
                    now_utc,
                ),
            )

            claimed = cursor.rowcount == 1
            db.commit()

        return attempt_id if claimed else None

    def record_job_observation(self, operation_id, job_id):
        """Persist an untrusted association, never an authorization.

        Both identifiers are caller-supplied. This method does not
        validate cloud provenance, launch jobs, or certify cleanup.
        """
        self._require_uuid(operation_id)
        self._require_uuid(job_id)

        with closing(self._connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                """
                INSERT INTO job_observations (operation_id, job_id)
                VALUES (?, ?)
                """,
                (operation_id, job_id),
            )
            db.commit()

    def list_job_observations(self, operation_id):
        """Return unverified associations, never trusted bindings."""
        self._require_uuid(operation_id)

        with closing(self._connect()) as db, db:
            rows = db.execute(
                """
                SELECT job_id
                FROM job_observations
                WHERE operation_id = ?
                ORDER BY job_id
                """,
                (operation_id,),
            ).fetchall()

        return [
            {"job_id": row[0], "binding_verified": False}
            for row in rows
        ]

    def reserve_job_creation(self, operation_id, request_id, now_utc):
        """Reserve one irreversible creation intent per operation.

        Coordination only; grants no authority to create Azure jobs.
        An unresolved reservation cannot be released or retried here.
        """
        self._require_uuid(operation_id)
        self._require_uuid(request_id)
        self._require_time(now_utc)

        with closing(self._connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            cursor = db.execute(
                """
                INSERT INTO job_creation_reservations
                    (operation_id, request_id, created_utc)
                SELECT ?, ?, ?
                WHERE EXISTS (
                    SELECT 1 FROM operations WHERE operation_id = ?
                )
                ON CONFLICT DO NOTHING
                """,
                (operation_id, request_id, now_utc, operation_id),
            )
            reserved = cursor.rowcount == 1
            db.commit()

        return reserved

    def record_failure(self, operation_id, attempt_id):
        """Return claimed recovery to pending; never mark success."""
        self._require_uuid(operation_id)
        self._require_uuid(attempt_id)

        with closing(self._connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")

            cursor = db.execute(
                """
                UPDATE operations
                SET state = 'RECOVERY_REQUIRED',
                    lease_until_utc = NULL,
                    attempt_id = NULL
                WHERE operation_id = ?
                  AND attempt_id = ?
                  AND state = 'RECOVERY_IN_PROGRESS'
                """,
                (operation_id, attempt_id),
            )

            changed = cursor.rowcount == 1
            db.commit()

        return changed