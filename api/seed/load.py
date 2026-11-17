"""Loads the sample data into an empty database. main.py calls it at startup, right
after the tables are created.

The seed files store day offsets ("due in 2 days"), not dates. materialize_seed.py
turns those into real UTC timestamps for today; this file puts them in the database.
"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

from models import Task, User
from seed.materialize_seed import materialize_seed, materialize_users

# Uvicorn's logger, so our messages show up in `docker compose logs app`.
log = logging.getLogger("uvicorn.error")
SEED_DIR = Path(__file__).parent  # the folder this file is in (api/seed)
# The seed fields that hold a timestamp, which need converting from text.
TIMESTAMP_KEYS = {"deadline", "remindAt", "snoozedUntil", "createdAt", "completedAt", "archivedAt"}


def _to_columns(row):
    """Convert one seed row into column values the table classes accept.

    Two conversions:
    - camelCase key -> snake_case column name (remindAt -> remind_at). The regular
      expression puts "_" before each capital letter, then everything is lowercased.
    - "2026-11-17T22:00:00Z" text -> a real datetime object. Table classes do not
      check their input, so passing the text through would only fail later, at the
      database.
    """
    return {
        re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower(): (
            datetime.fromisoformat(value) if key in TIMESTAMP_KEYS and value is not None else value
        )
        for key, value in row.items()
    }


def seed_if_empty(engine):
    """Insert the seed users and tasks, but only if the tasks table is empty.

    Running only on an empty table means restarting the app never duplicates the data
    or wipes anything entered during a demo. `docker compose down -v` empties the
    database, so the next start seeds again with fresh dates.

    Everything happens in one transaction: if any row breaks a database rule, nothing
    is saved, rather than half the data.
    """
    with Session(engine) as session:
        # Is there at least one task? If so, the database has been seeded already.
        if session.exec(select(Task.id).limit(1)).first() is not None:
            log.info("Seed skipped: tasks table already has data")
            return

        # Read the JSON files and turn day offsets into real timestamps.
        users = materialize_users(json.loads((SEED_DIR / "users.seed.json").read_text()))
        tasks = materialize_seed(json.loads((SEED_DIR / "tasks.seed.json").read_text()))

        # Users first: every task's owner_id must point at an existing user.
        # flush() sends the INSERTs to the database without committing yet.
        session.add_all(User(**_to_columns(u)) for u in users)
        session.flush()
        session.add_all(Task(**_to_columns(t)) for t in tasks)
        session.flush()

        # MOVE THE ID COUNTERS PAST THE SEEDED IDS.
        # The seed gives every row its own id (tasks 1-66). Postgres does not advance
        # its id counter when an insert supplies the id, so the counter is still at 1.
        # Without this, the first task created in the app would be given id 1, which is
        # taken, and the save would fail as a duplicate. setval moves each counter to
        # the highest id in use, so the next new task gets 67.
        conn = session.connection()
        for table in ("users", "tasks"):
            conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT max(id) FROM {table}))"))

        # Save everything at once. Until here, nothing was permanent.
        session.commit()
        log.info("Seeded %d user(s), %d tasks", len(users), len(tasks))
