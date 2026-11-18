"""Turns tasks.seed.json (day offsets) into task rows with UTC timestamps.

Should be called from the API's startup, after the tables exist and only if the tasks
table is empty. Offsets are resolved against "today" in DEMO_TZ, the time zone
the demo is viewed in, so today's tasks land on the viewer's today even though
the container clock runs in UTC.
"""
import json
import os
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

# Local time of day used when the seed only gives a day offset.
DEFAULT_TIMES = {
    "deadline": time(20, 0), # 8PM Eastern = 5PM Pacific, so a default deadline still covers the West Coast workday
    "remindAt": time(7, 0), # 7AM
    "snoozedUntil": time(7, 0), # 7AM
    "createdAt": time(9, 0), # 9AM
    "completedAt": time(16, 0), # 4PM
    "archivedAt": time(12, 0), # 12PM
}

def _to_utc(offset_days, local_time, today, tz):
    """Turn a day offset into a UTC timestamp string, or None if there is no offset.

    The offset counts days from `today` (negative is in the past, 0 is today,
    1 is tomorrow). The result is that day at `local_time` in the demo time zone
    `tz`, converted to UTC and formatted as ISO 8601, for example
    "2026-11-17T22:00:00Z" for 17:00 in New York.

    A None offset means the seed left the field empty (no deadline, never
    completed, and so on), so the field stays empty.
    """
    if offset_days is None:
        return None
    local = datetime.combine(today + timedelta(days=offset_days), local_time, tzinfo=tz)
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _today(now, tz_name):
    """Work out today's date in the demo time zone, and return it with that zone.

    The zone is `tz_name` if given, otherwise the DEMO_TZ environment variable,
    otherwise America/New_York. `now` is the current moment and defaults to the
    real clock; tests can pass a fixed datetime instead.

    This is the reason DEMO_TZ exists: the container clock is UTC, so on a US
    evening the UTC date is already tomorrow. Taking the date in the viewer's
    zone keeps "due today" tasks on the viewer's today.
    """
    tz =ZoneInfo(tz_name or os.environ.get("DEMO_TZ", "America/New_York"))
    return (now or datetime.now(timezone.utc)).astimezone(tz).date(), tz


def materialize_users(seed, now=None, tz_name=None):
    """Turn users.seed.json entries into user rows ready to insert.

    Copies the name fields as they are and turns createdOffsetDays into a UTC
    createdAt timestamp. preferredName is optional and becomes None if missing.
    `now` and `tz_name` work as in _today.

    Insert these before the tasks: tasks.ownerId references users.id.
    """
    today, tz = _today(now, tz_name)
    return [
        {
            "id": u["id"],
            "firstname": u["firstname"],
            "lastname": u["lastname"],
            "preferredName": u.get("preferredName"),
            "createdAt": _to_utc(u["createdOffsetDays"], DEFAULT_TIMES["createdAt"], today, tz),
        }
        for u in seed
    ]


def materialize_seed(seed, now=None, tz_name=None):
    """Turn tasks.seed.json entries into task rows ready to insert.

    Plain fields (title, status, category, priority, pinned, ...) are copied as
    they are. Every *OffsetDays field becomes a UTC timestamp through _to_utc,
    at the time of day in DEFAULT_TIMES. The exception is the deadline, which
    uses the task's own "deadlineTime" (for example "08:00") when the seed gives
    one. `now` and `tz_name` work as in _today.

    Call materialize_users and insert the users first, because every task's
    ownerId must point at an existing user.
    """
    today, tz = _today(now, tz_name)
    tasks = []
    for t in seed:
        # Some tasks are due at a set time (the 08:00 brief); the rest fall back to 20:00.
        deadline_time = (
            time.fromisoformat(t["deadlineTime"]) if t.get("deadlineTime") else DEFAULT_TIMES["deadline"]
        )
        tasks.append(
            {
                "id": t["id"],
                "title": t["title"],
                "description": t["description"],
                "deadline": _to_utc(t["deadlineOffsetDays"], deadline_time, today, tz),
                "status": t["status"],
                "category": t["category"],
                "type": t["type"],
                "priority": t["priority"],
                "remindAt": _to_utc(t["remindOffsetDays"], DEFAULT_TIMES["remindAt"], today, tz),
                "ownerId": t["ownerId"],
                "pinned": t["pinned"],
                "snoozedUntil": _to_utc(t["snoozedUntilOffsetDays"], DEFAULT_TIMES["snoozedUntil"], today, tz),
                "createdAt": _to_utc(t["createdOffsetDays"], DEFAULT_TIMES["createdAt"], today, tz),
                "completedAt": _to_utc(t["completedOffsetDays"], DEFAULT_TIMES["completedAt"], today, tz),
                "archivedAt": _to_utc(t["archivedOffsetDays"], DEFAULT_TIMES["archivedAt"], today, tz),
            }
        )
    return tasks


if __name__ == "__main__":
    # Preview only: print the task rows as they would be inserted right now,
    # without touching the database. Run: python3 seed/materialize_seed.py
    # (set DEMO_TZ first to preview another zone).
    here = Path(__file__).parent
    seed = json.loads((here / "tasks.seed.json").read_text())
    print(json.dumps(materialize_seed(seed), indent=2))
    # users: materialize_users(json.loads((here / "users.seed.json").read_text()))
