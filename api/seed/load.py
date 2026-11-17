"""Loads the seed data into an empty database. Called from the API's startup after create_all."""
import json
import logging
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

from models import Task, User
from seed.materialize_seed import materialize_seed, materialize_users

log = logging.getLogger("uvicorn.error")
SEED_DIR = Path(__file__).parent
TIMESTAMP_KEYS = {"deadline", "remindAt", "snoozedUntil", "createdAt", "completedAt", "archivedAt"}


def _to_columns(row):
    """camelCase seed row -> snake_case column values, with ISO strings parsed into aware datetimes.

    SQLModel table classes do not validate their input, so a raw string would only fail
    at the database; parsing here keeps the types right.
    """
    return {
        re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower(): (
            datetime.fromisoformat(value) if key in TIMESTAMP_KEYS and value is not None else value
        )
        for key, value in row.items()
    }


def seed_if_empty(engine):
    """Insert the seed users and tasks if the tasks table is empty, in one transaction.

    The seed sets ids itself, and Postgres does not move an identity counter for explicit
    ids, so each counter is moved past the highest seeded id. Without that the first task
    created in the app would get id 1 and fail as a duplicate.
    """
    with Session(engine) as session:
        if session.exec(select(Task.id).limit(1)).first() is not None:
            log.info("Seed skipped: tasks table already has data")
            return

        users = materialize_users(json.loads((SEED_DIR / "users.seed.json").read_text()))
        tasks = materialize_seed(json.loads((SEED_DIR / "tasks.seed.json").read_text()))

        session.add_all(User(**_to_columns(u)) for u in users)
        session.flush()  # users first: tasks.owner_id references them
        session.add_all(Task(**_to_columns(t)) for t in tasks)
        session.flush()

        conn = session.connection()
        for table in ("users", "tasks"):
            conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT max(id) FROM {table}))"))

        session.commit()
        log.info("Seeded %d user(s), %d tasks", len(users), len(tasks))
