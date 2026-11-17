"""Database tables. Mirrors schema.sql, which is the reference: create_all builds the
tables from these classes, so every CHECK and the partial index are declared here too.
Constraint names match what Postgres gives schema.sql, so an error names a rule you can find there.
"""
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, DateTime, Identity, Index, Integer, Text, text
from sqlmodel import Field, SQLModel


def _now():
    return datetime.now(timezone.utc)


def _timestamptz(nullable=True):
    return {"sa_type": DateTime(timezone=True), "nullable": nullable}


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("length(trim(firstname)) > 0", name="users_firstname_check"),
        CheckConstraint("length(trim(lastname)) > 0", name="users_lastname_check"),
    )

    id: int | None = Field(default=None, sa_column=Column(Integer, Identity(), primary_key=True))
    firstname: str = Field(sa_type=Text)
    lastname: str = Field(sa_type=Text)
    preferred_name: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(
        default_factory=_now, sa_column_kwargs={"server_default": text("now()")}, **_timestamptz(False)
    )


class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    __table_args__ = (
        # Column checks (unnamed in schema.sql; these are the names Postgres generates for them).
        CheckConstraint("length(trim(title)) BETWEEN 1 AND 120", name="tasks_title_check"),
        CheckConstraint("length(description) <= 5000", name="tasks_description_check"),
        CheckConstraint("status IN ('Not Started', 'In-Progress')", name="tasks_status_check"),
        CheckConstraint("category IN ('Admin', 'Supply', 'Flight', 'Personal')", name="tasks_category_check"),
        CheckConstraint("type IN ('Follow-up', 'Reminder', 'Sign-off', 'Recurring')", name="tasks_type_check"),
        CheckConstraint("priority IN ('Low', 'Medium', 'High')", name="tasks_priority_check"),
        # Table rules, named as in schema.sql.
        CheckConstraint(
            "remind_at IS NULL OR deadline IS NULL OR remind_at <= deadline", name="remind_not_after_deadline"
        ),
        CheckConstraint(
            "snoozed_until IS NULL OR deadline IS NOT NULL OR remind_at IS NOT NULL",
            name="snooze_needs_alert_source",
        ),
        CheckConstraint(
            "snoozed_until IS NULL OR remind_at IS NULL OR snoozed_until > remind_at", name="snooze_after_reminder"
        ),
        CheckConstraint(
            "snoozed_until IS NULL OR (completed_at IS NULL AND archived_at IS NULL)", name="no_snooze_when_done"
        ),
        CheckConstraint("NOT pinned OR archived_at IS NULL", name="no_pin_when_archived"),
        CheckConstraint("archived_at IS NULL OR archived_at >= created_at", name="archived_on_or_after_created"),
        CheckConstraint("snoozed_until IS NULL OR snoozed_until >= created_at", name="snooze_on_or_after_created"),
        # The Today view and the overdue check both filter open tasks by deadline.
        Index(
            "tasks_open_by_deadline",
            "owner_id",
            "deadline",
            postgresql_where=text("completed_at IS NULL AND archived_at IS NULL"),
        ),
    )

    id: int | None = Field(default=None, sa_column=Column(Integer, Identity(), primary_key=True))
    title: str = Field(sa_type=Text)
    description: str | None = Field(default=None, sa_type=Text)
    deadline: datetime | None = Field(default=None, **_timestamptz())
    status: str = Field(default="Not Started", sa_type=Text, sa_column_kwargs={"server_default": "Not Started"})
    category: str | None = Field(default=None, sa_type=Text)
    type: str | None = Field(default=None, sa_type=Text)
    priority: str = Field(default="Low", sa_type=Text, sa_column_kwargs={"server_default": "Low"})
    remind_at: datetime | None = Field(default=None, **_timestamptz())
    owner_id: int = Field(foreign_key="users.id")
    pinned: bool = Field(default=False, sa_column_kwargs={"server_default": text("false")})
    snoozed_until: datetime | None = Field(default=None, **_timestamptz())
    created_at: datetime = Field(
        default_factory=_now, sa_column_kwargs={"server_default": text("now()")}, **_timestamptz(False)
    )
    completed_at: datetime | None = Field(default=None, **_timestamptz())
    archived_at: datetime | None = Field(default=None, **_timestamptz())
