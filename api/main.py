"""Task Manager API. Serves the built UI from ./static when it exists (the Docker image)."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, create_engine

import models  # noqa: F401  registers the tables before create_all
from seed.load import seed_if_empty

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://taskmanager:taskmanager@localhost:5432/taskmanager"
)
engine = create_engine(DATABASE_URL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)  # tables come from models.py, imported above
    seed_if_empty(engine)
    yield


app = FastAPI(title="Task Manager", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# This must be last: API routes above take priority, everything else is the UI.
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="ui")
