"""Task Manager API: the entry point that Uvicorn runs (`main:app`).

Wires the pieces together: creates the tables, seeds the data, adds the API routes,
and serves the built React UI from ./static (present in the Docker image).
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel

# models must be imported before create_all runs, so the tables are known. It looks
# unused, hence the noqa comment that tells the linter to leave it alone.
import models  # noqa: F401
from db import engine
from routes import router
from seed.load import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown. Code before `yield` runs once when the app starts; code after
    it would run on shutdown (there is none)."""
    # Create any missing tables, with their CHECK rules and index, from models.py.
    # Existing tables are left alone; there is no migration tool.
    SQLModel.metadata.create_all(engine)
    seed_if_empty(engine)
    yield


app = FastAPI(title="Task Manager", lifespan=lifespan)


@app.exception_handler(IntegrityError)
def integrity_error(request: Request, exc: IntegrityError):
    """Turn a broken database rule into a clear 422 instead of a 500 server error.

    Runs whenever a commit fails a database rule, such as a reminder after the deadline.
    The reply names the rule, e.g. {"detail": "remind_not_after_deadline"}, which can be
    found in schema.sql. Without this handler the UI would only see "Internal Server Error".

    Syntax note: getattr(obj, "name", None) reads obj.name, or gives None if it doesn't
    exist. It is used twice so a missing piece gives None instead of crashing.
    `name or "..."` falls back to a generic message when there is no rule name.
    """
    name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    return JSONResponse(status_code=422, content={"detail": name or "Database rule violated"})


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(router)

# This must be last. Anything that isn't an API route above falls through to the UI
# files, so the UI and the API share one address and need no proxy or CORS setup.
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="ui")
