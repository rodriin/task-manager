"""Task Manager API. Serves the built UI from ./static when it exists (the Docker image)."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, create_engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://taskmanager:taskmanager@localhost:5432/taskmanager"
)
engine = create_engine(DATABASE_URL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import the SQLModel table classes above this line so create_all sees them.
    SQLModel.metadata.create_all(engine)
    # Seed here: if the tasks table is empty, insert seed/users.seed.json then
    # seed/tasks.seed.json through seed/materialize_seed.py.
    yield


app = FastAPI(title="Task Manager", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# This must be last: API routes above take priority, everything else is the UI.
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="ui")
