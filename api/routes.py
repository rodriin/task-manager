"""The JSON API: list, create, update.

Kept thin on purpose. Clone is a create; complete, snooze, pin and archive are all
updates. There is no delete: archiving is how a task goes away, so nothing is lost.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db import get_session
from models import Task, User
from schemas import TaskCreate, TaskRead, TaskUpdate, UserRead

# Single user, no login: every request acts as the seeded user, id 1 (Maverick).
CURRENT_USER_ID = 1

router = APIRouter(prefix="/api")
SessionDep = Annotated[Session, Depends(get_session)]


# response_model: FastAPI shapes the reply with this schema (camelCase JSON) and
# documents it at /docs.
@router.get("/me", response_model=UserRead)
def get_me(session: SessionDep):
    """GET /api/me: the current user, with the display name the UI shows."""
    user = session.get(User, CURRENT_USER_ID)
    if user is None:
        raise HTTPException(404, "User not found")
    return UserRead.model_validate(user)


@router.get("/tasks", response_model=list[TaskRead])
def list_tasks(session: SessionDep):
    """GET /api/tasks: every task for the user, archived ones included, ordered by id.

    The UI loads them all in one request and does the rest itself: it builds the Today
    view, works out Overdue and Completed, and sorts and filters the full list.
    """
    query = select(Task).where(Task.owner_id == CURRENT_USER_ID).order_by(Task.id)
    tasks = session.exec(query).all()
    return [TaskRead.model_validate(t) for t in tasks]


@router.post("/tasks", response_model=TaskRead, status_code=201)
def create_task(body: TaskCreate, session: SessionDep):
    """POST /api/tasks: create a task. Clone uses this too, sending a copy of a task's fields.

    `body: TaskCreate` makes FastAPI read the JSON body and check it against TaskCreate
    (schemas.py) before this function runs. Invalid input never reaches this code.
    Returns 201 Created with the saved task, including its new id.
    """
    task = Task(**body.model_dump(), owner_id=CURRENT_USER_ID)
    session.add(task)
    session.commit()
    session.refresh(task)
    return TaskRead.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
def update_task(task_id: int, body: TaskUpdate, session: SessionDep):
    """PATCH /api/tasks/{id}: change only the fields sent.

    One route covers every change to a task:
      edit         {"title": "...", "deadline": "..."}
      complete     {"completedAt": "<now>"}      un-complete  {"completedAt": null}
      snooze       {"snoozedUntil": "<time>"}
      pin          {"pinned": true}
      archive      {"archivedAt": "<now>"}       un-archive   {"archivedAt": null}

    {task_id} in the path becomes the task_id parameter; `: int` makes FastAPI reject
    a non-number with a 422.
    """
    task = session.get(Task, task_id)
    # 404 for a task that doesn't exist, and for one that isn't this user's.
    if task is None or task.owner_id != CURRENT_USER_ID:
        raise HTTPException(404, "Task not found")

    # Only the fields the request actually sent (exclude_unset=True), as a dict like
    # {"completed_at": datetime(...)}. A field sent as null is included, with value None,
    # which is how a field gets cleared.
    changes = body.model_dump(exclude_unset=True)

    # SERVER-SIDE CLEAN-UP, so the save is not rejected by the database.
    # The database refuses (see the CHECKs in schema.sql):
    #   - an archived task that is pinned        (no_pin_when_archived)
    #   - an archived task that is snoozed       (no_snooze_when_done)
    #   - a completed task that is snoozed       (no_snooze_when_done)
    # Instead of every screen in the UI having to remember to clear those fields, the
    # server does it whenever a task is archived or completed. These lines override
    # whatever the request sent for pinned or snoozedUntil. The database checks stay as
    # the backstop if anything else gets it wrong.
    # `is not None` means archiving or completing; sending null (un-archive or
    # un-complete) does not trigger the clean-up.
    if changes.get("archived_at") is not None:
        changes.update(pinned=False, snoozed_until=None)
    if changes.get("completed_at") is not None:
        changes["snoozed_until"] = None

    # Un-completing only clears completed_at. Completing never touched the stored status,
    # so the task's earlier status ("In progress", say) comes back by itself.
    for field, value in changes.items():
        setattr(task, field, value)
    session.commit()
    session.refresh(task)
    return TaskRead.model_validate(task)
