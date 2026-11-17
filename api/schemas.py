"""JSON shapes for the API: what a request may send, and what a response returns.

These are Pydantic models, separate from the database tables in models.py. FastAPI uses
them to check every incoming request before our code runs: a wrong type, a missing title
or a misspelled field is answered with a 422 automatically, listing what was wrong.

Naming: the JSON uses camelCase (remindAt), Python and the database use snake_case
(remind_at). `to_camel` converts between them, so each field is written once, in
snake_case, below.
"""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints, computed_field, model_validator
from pydantic.alias_generators import to_camel

# Allowed values. They match the CHECK constraints in schema.sql, so a bad value is
# caught here with a clear message instead of at the database.
Status = Literal["Not Started", "In-Progress"]  # Completed and Overdue are derived, never stored
Category = Literal["Admin", "Supply", "Flight", "Personal"]
TaskType = Literal["Follow-up", "Reminder", "Sign-off", "Recurring"]
Priority = Literal["Low", "Medium", "High"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Description = Annotated[str, StringConstraints(max_length=5000)]


class ReadModel(BaseModel):
    """Base for responses. `class X(Base)` means X inherits Base's settings.

    - alias_generator=to_camel: each field also gets a camelCase name.
    - from_attributes + validate_by_name: can be built straight from a database row
      object, reading its snake_case attributes (task.remind_at).
    - serialize_by_alias: the JSON sent back uses the camelCase names (remindAt).
    """

    model_config = ConfigDict(
        alias_generator=to_camel, from_attributes=True, validate_by_name=True, serialize_by_alias=True
    )


class WriteModel(BaseModel):
    """Base for requests.

    Only the camelCase names are accepted, and extra="forbid" rejects any field we do
    not know. So a typo such as `remind_at` (instead of `remindAt`) is a 422, rather
    than being silently ignored and leaving the user wondering why nothing changed.
    """

    model_config = ConfigDict(alias_generator=to_camel, extra="forbid")


class UserRead(ReadModel):
    """Response for GET /api/me."""

    id: int
    firstname: str
    lastname: str
    preferred_name: str | None

    # @computed_field + @property: a value worked out from other fields and included in
    # the JSON as if it were a field (displayName). It is not stored anywhere.
    @computed_field
    @property
    def display_name(self) -> str:
        return self.preferred_name or f"{self.firstname} {self.lastname}"


class TaskRead(ReadModel):
    """Response shape for one task: every column, camelCase in the JSON.

    Plain `datetime` here (not AwareDatetime): these come from the database, which
    stores them in UTC, so they always carry a time zone and are sent like
    "2026-11-17T22:00:00Z".
    """

    id: int
    title: str
    description: str | None
    deadline: datetime | None
    status: Status
    category: Category | None
    type: TaskType | None
    priority: Priority
    remind_at: datetime | None
    owner_id: int
    pinned: bool
    snoozed_until: datetime | None
    created_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class TaskCreate(WriteModel):
    """Request body for POST /api/tasks: a new task, or a clone of one.

    Only title is required; everything else has a default.

    Deliberately NOT accepted (sending them is a 422):
    - id, ownerId, createdAt: the server sets these.
    - snoozedUntil, archivedAt: these are actions on a task that already exists, so they
      only come through an update.
    completedAt IS accepted, so work that was already done can be logged.

    AwareDatetime: a time must include its time zone ("...Z" or "+05:00"). A bare
    "2026-11-18T09:00" is rejected, because we can't know whose 9am it is, and storage is UTC.
    """

    title: Title
    description: Description | None = None
    deadline: AwareDatetime | None = None
    status: Status = "Not Started"
    category: Category | None = None
    type: TaskType | None = None
    priority: Priority = "Low"
    remind_at: AwareDatetime | None = None
    pinned: bool = False
    completed_at: AwareDatetime | None = None


class TaskUpdate(WriteModel):
    """Request body for PATCH /api/tasks/{id}: a partial update.

    Every field is optional. The route only changes the fields the request actually sent
    (see exclude_unset in routes.py), so:
    - field missing from the JSON  -> left as it is
    - field sent as null           -> cleared (for example, "remindAt": null removes the reminder)
    - field sent with a value      -> set to that value

    This is how one route covers edit, complete, un-complete, snooze, pin and archive:
    each is just a different set of fields, such as {"completedAt": "..."} to complete
    or {"completedAt": null} to un-complete.
    """

    title: Title | None = None
    description: Description | None = None
    deadline: AwareDatetime | None = None
    status: Status | None = None
    category: Category | None = None
    type: TaskType | None = None
    priority: Priority | None = None
    remind_at: AwareDatetime | None = None
    pinned: bool | None = None
    completed_at: AwareDatetime | None = None
    snoozed_until: AwareDatetime | None = None
    archived_at: AwareDatetime | None = None

    # Runs after the fields above have been checked (mode="after").
    @model_validator(mode="after")
    def required_fields_not_null(self):
        """Refuse null for fields the database requires.

        The fields above allow None so they can be left out, but title, status, priority
        and pinned can't be empty in the database. Without this check, {"title": null}
        would pass here and then fail at the database with a vague error. With it, the
        caller gets a clear 422: "title cannot be null".
        model_fields_set is the set of fields the request actually sent.
        """
        for name in ("title", "status", "priority", "pinned"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{to_camel(name)} cannot be null")
        return self
