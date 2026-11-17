"""Database connection: one shared engine, and a fresh session for each API request."""
import os

from sqlmodel import Session, create_engine

# Where the database is. Docker Compose sets DATABASE_URL to point at the `db` container;
# the fallback after the comma is for local dev, where Postgres is published on localhost.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://taskmanager:taskmanager@localhost:5432/taskmanager"
)


engine = create_engine(DATABASE_URL)


def get_session():
    """Give one request its own database session, and close it when the request ends.

    This is a FastAPI "dependency": a route asks for it as a parameter (see SessionDep
    in routes.py) and FastAPI calls this function for it.

    Notes:
    - `with Session(engine) as session:` opens a session and guarantees it is closed when
      the block ends, even after an error. Anything not committed is rolled back.
    - `yield` hands the session to the route and pauses here. When the route has
      finished, the function resumes, the `with` block ends and the session closes.
    """
    with Session(engine) as session:
        yield session
