# Build plan

Working plan for the build, split into parts. A part is a unit of planned work, not a strict commit: it may land as several smaller commits, alongside bug fixes, and this file may catch up a few commits later. It is updated as the plan changes; the reasoning behind choices lives in `DECISIONS.md`.

| Part | Scope | Status |
| --- | --- | --- |
| 1 | Data seed: models and seed loader | Done |
| 2 | API routes: list, create, update | Done |
| 3 | UI: the scan (Pinned, Today, Tomorrow, Reminders), read-only | Done |
| 4+ | Not planned yet | — |

---

## Part 1: Data seed

**Goal:** `docker compose up` creates the tables with the schema rules in force, loads the seed data once, and the data can be inspected with plain SQL.

**Out of scope:** API routes (list, create, update) and the camelCase JSON. They come next and will use these models.

### 1.1 Models: `api/models.py`

- `User`: `id`, `firstname`, `lastname`, `preferred_name`, `created_at`.
- `Task`: every column in `schema.sql`, with the same snake_case names. Timestamps are `datetime` stored as `timestamptz` (`sa_column=Column(DateTime(timezone=True))`).
- `Task.__table_args__` copies `schema.sql`:
  - every `CHECK`, including the allowed values for `status`, `category`, `type` and `priority`, and the title and description lengths;
  - the partial index `tasks_open_by_deadline` (`postgresql_where`).
- Constraint names match `schema.sql`, so a rejected save names a rule you can find there.
- `main.py` imports the models before `create_all` runs.

### 1.2 Seed loader: `api/seed/load.py`

`seed_if_empty(engine)`, called in `lifespan` right after `create_all`:

1. If the tasks table has any row, stop. Data survives restarts; only `down -v` re-seeds.
2. Build rows with `materialize_users` and `materialize_seed` from `seed/materialize_seed.py` (unchanged).
3. Map the camelCase keys to snake_case columns, and parse the ISO `"...Z"` strings into aware datetimes with `datetime.fromisoformat`. SQLModel table classes do not validate input, so raw strings would only fail at the database.
4. Insert users, then tasks, in one transaction, so a rule violation leaves nothing half-seeded.
5. Move each id counter past the seeded ids. The seed sets ids 1–66 itself, and Postgres does not advance the counter for explicit ids, so the first task created in the app would otherwise get id 1 and fail as a duplicate:
   ```sql
   SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));
   SELECT setval(pg_get_serial_sequence('tasks', 'id'), (SELECT max(id) FROM tasks));
   ```
6. Log one line with the counts (`Seeded 1 user, 66 tasks`), or that seeding was skipped.

The image's working directory is `/app` (the `api/` folder), so `from seed.materialize_seed import ...` works both in Docker and with `fastapi dev`.

Already checked before writing code: all 66 materialized seed tasks pass every `schema.sql` rule, at different UTC hours and on both DST change days.

### 1.3 Verify

Start from nothing, the way a reviewer would:

```bash
docker compose down -v --rmi local
docker compose up --build
```

The app logs should show the seed line once. Then open psql inside the database container (no local Postgres or published port needed):

```bash
docker compose exec db psql -U taskmanager -d taskmanager
```

Queries to look at the data:

```sql
-- Show timestamps in the demo time zone instead of UTC.
SET timezone = 'America/New_York';

-- Tables, rules and the partial index exist.
\d tasks

-- Counts.
SELECT count(*) FROM users;   -- 1
SELECT count(*) FROM tasks;   -- 66

-- The user, with the display name the app will use.
SELECT id, coalesce(preferred_name, firstname || ' ' || lastname) AS display_name FROM users;

-- Open tasks in deadline order: overdue at the top, today's next.
SELECT id, title, deadline, remind_at, status, priority,
       deadline < now() AS overdue
FROM tasks
WHERE completed_at IS NULL AND archived_at IS NULL
ORDER BY deadline NULLS LAST;

-- Due today in the demo time zone.
SELECT id, title, deadline FROM tasks
WHERE deadline::date = current_date AND completed_at IS NULL AND archived_at IS NULL
ORDER BY deadline;

-- The special cases in the seed.
SELECT id, title, pinned, snoozed_until, completed_at, archived_at
FROM tasks
WHERE pinned OR snoozed_until IS NOT NULL OR archived_at IS NOT NULL
ORDER BY id;
```

Checks that prove the loader, not just the data:

- [x] Restart without `-v` (`docker compose restart app`): the log says seeding was skipped and `count(*)` is still 66.
- [x] Id counter: `BEGIN; INSERT INTO tasks (title, owner_id) VALUES ('counter check', 1) RETURNING id; ROLLBACK;` returns 67. The rollback removes the row but not the counter step (Postgres counters ignore rollbacks), so the next real task gets 68. A gap in ids is harmless.
- [x] A rule is enforced: `UPDATE tasks SET pinned = true WHERE archived_at IS NOT NULL;` fails with `no_pin_when_archived`.
- [x] Today's 08:00 brief shows as today in the "due today" query.
- [x] `\d tasks` lists all 13 checks and the partial index; column types, defaults and the identity id match `schema.sql`.

Verified 2026-11-17 on a fresh `down -v --rmi local` + `up --build`.

---

## Part 2: API routes

**Goal:** the UI can load every task and change them through a small JSON API. The API stays thin: **list, create, update**. Clone is a create; complete, snooze, pin and archive are updates. There is no delete: archiving is how a task goes away. JSON is camelCase; the database stays snake_case. Single user: the API acts as user 1.

**Out of scope:** the UI that calls these routes.

### Endpoints

All under `/api`, registered before the static mount in `main.py`.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/me` | The one user: `id`, `firstname`, `lastname`, `preferredName`, `displayName` |
| GET | `/api/tasks` | All of user 1's tasks, archived included, ordered by id. The UI sorts and filters. |
| POST | `/api/tasks` | Create; returns 201 and the task. Clone uses this. |
| PATCH | `/api/tasks/{id}` | Partial update: only the fields sent change, and an explicit `null` clears a field. 404 if the task is not user 1's. |

### 2.1 Database session: `api/db.py`

- Move `DATABASE_URL` and `engine` out of `main.py`, and add a `get_session()` dependency. This keeps `main.py` and the routes from importing each other.

### 2.2 Request and response shapes: `api/schemas.py`

- All models use `alias_generator=to_camel` and `populate_by_name=True`, and reject unknown fields (`extra="forbid"`), so a typo such as `remind_at` gets a 422 instead of being silently ignored.
- `TaskRead`: every column, camelCase.
- `TaskCreate`: `title` (required, trimmed, 1–120 characters), `description` (up to 5000), `deadline`, `status`, `category`, `type`, `priority`, `remindAt`, `pinned`, `completedAt` (so past work can be logged). Not accepted: `id`, `ownerId` and `createdAt` (the server sets them), and `snoozedUntil` and `archivedAt` (actions on an existing task).
- `TaskUpdate`: every `TaskCreate` field, optional, plus `snoozedUntil` and `archivedAt`.
- `Literal` types for `status`, `category`, `type` and `priority`. Timestamps must include a time zone (`AwareDatetime`); times without one are rejected, because storage is UTC.
- `UserRead` with a computed `displayName`: `preferredName` if set, otherwise first and last name.

### 2.3 Routes: `api/routes.py`

- An `APIRouter(prefix="/api")` with the four routes and `CURRENT_USER_ID = 1`.
- PATCH applies only the fields sent (`model_dump(exclude_unset=True)`), then cleans up so the database checks pass:
  - setting `archivedAt` also sets `pinned = false` and `snoozedUntil = null`;
  - setting `completedAt` also sets `snoozedUntil = null`;
  - un-archiving or un-completing only clears the timestamp. The stored `status` was never changed, so the task's earlier status comes back by itself.
- No other rules on the server. The UI works out snooze times, the reminder shift when a deadline moves, and "now", and sends the results.
- A database check failure returns **422** with the constraint name as the detail, for example `remind_not_after_deadline`. The names match `schema.sql`.

### 2.4 Wire up: `api/main.py`

- Import `engine` from `db`, and include the router above the static mount. Keep `/api/health`.

### 2.5 Verify

There are no API tests, by design. Check with curl or the interactive docs at <http://localhost:8000/docs>, after `docker compose up --build`:

- [x] `GET /api/me` returns `displayName: "Maverick"`.
- [x] `GET /api/tasks` returns 66 tasks with camelCase keys, archived ones included, and timestamps with a UTC offset.
- [x] `POST /api/tasks` with only a title returns 201, an id of 67 or more, `ownerId: 1`, `status: "Not Started"` and `priority: "Low"`.
- [x] `POST` with `remind_at` (snake_case), a time with no time zone, or a blank title returns 422.
- [x] `PATCH` pinned task 10 with `archivedAt` returns 200 with `pinned: false`.
- [x] `PATCH` snoozed task 11 with `completedAt` returns 200 with `snoozedUntil: null`. Then `completedAt: null` gives back its original status (also checked on In-Progress task 2).
- [x] `PATCH` a `remindAt` later than the deadline returns 422 `remind_not_after_deadline`.
- [x] `PATCH /api/tasks/9999` returns 404.
- [x] The UI is still served at `/`, and `/docs` lists the routes.
- [x] Local dev: `fastapi dev main.py` starts (checked that `main` imports from the local venv).
- [x] `PATCH` with `title: null` returns 422 (title, status, priority and pinned can't be cleared).

Verified 2026-11-17, then re-seeded with `down -v` so the demo data is clean.

---

## Part 3: The scan (Today and Tomorrow view)

**Goal:** the app opens on one screen that answers "what's now and what's next", built from the real API data. Read-only for this part. Sections, top to bottom: **Pinned**, **Today**, **Tomorrow**, **Reminders**.

**Out of scope:** the full task list (All tab), task detail and edit, clone, alert banner, snooze actions, "You're caught up" message. Those are later parts.

### Rules

All dates are the viewer's local day, worked out in the browser. "Open" means not completed and not archived. Only open tasks appear. Each task lands in the first section it qualifies for, so it appears once.

1. **Pinned:** every pinned task, whatever its dates. Hidden when there are none.
2. **Today:** deadline before the end of today, overdue included.
3. **Tomorrow:** deadline tomorrow.
4. **Reminders:** only reminders that have already fired, on tasks in none of the above (deadline later, or no deadline). A reminder that hasn't fired yet shows nowhere, to avoid noise. Hidden when there are none.

Tasks that fit none (due later, reminder not reached yet) wait for the full list.

- **Overdue** = deadline has passed and the task is not completed. Derived, never stored. It flips the minute the deadline passes: the screen's clock ticks once a minute, no reload needed.
- **Order:** Pinned and Today put overdue first, then by deadline; Tomorrow by deadline; Reminders oldest reminder first. No deadline sorts last.
- **Colour = alert state:** red for overdue, amber for a reached reminder that isn't overdue, plain otherwise. The High priority tag is neutral so it isn't mistaken for an alert.
- **Each row shows:** title, pin marker, High tag, "In progress" tag; then the due time (or "Overdue · was due …"), the reminder time, category, and "Snoozed until …" while a snooze runs. Snoozed tasks stay visible.
- **Times** are 24-hour (`HH:mm`), with the day added when it isn't today.
- **Seed:** the default due time is 20:00 local (was 17:00), in `api/seed/materialize_seed.py`. Needs `docker compose down -v` to re-seed.

### 3.1 Data: `web/src/api/client.ts`, `web/src/types.ts`

- `Task` and `User` types matching the API's camelCase JSON. Timestamps arrive as ISO strings and are turned into `Date` objects in one place.
- `fetchTasks()` and `fetchMe()` with plain `fetch` on `/api/...`. A non-OK response throws, so the screen can show an error.
- TanStack Query: a `QueryClientProvider` in `main.tsx`; `useQuery` for tasks and for the user.

### 3.2 Task helpers: `web/src/helpers/` (`taskHelpers.ts`, `taskHelpers.test.ts`)

Plain functions with no React, so they can be tested with a fixed "now":

- `isOpen`, `isOverdue`, `isReminderActive`, `isSnoozed`.
- `buildScan(tasks, now)` returns `{ pinned, today, tomorrow, reminders }`, filtered and sorted per the rules above.

Tests cover: overdue flips at the deadline; a reminder turns on at its time; pinned wins whatever the dates; the Today/Tomorrow split at local midnight; overdue from earlier days in Today; a reached reminder stays in Today or Tomorrow when the deadline is there, otherwise goes to Reminders; unreached reminders show nowhere; completed and archived never show; snoozed still show; a task is never in two sections; the order of each section.

### 3.3 Screen: `web/src/App.tsx`, `web/src/components/` (`TaskSection.tsx`, `TaskRow.tsx`)

`helpers/` holds plain functions (no React) and their tests; `components/` holds the UI pieces; `useNow.ts` (the clock hook) sits at the top of `src/` next to `App.tsx`, which uses it.

- `useNow()` hook: the current time, updated every 60 seconds.
- `App`: header with the user's display name and the date and time, then the four sections. Simple loading and error text.
- `TaskSection`: heading with the date (Today, Tomorrow) and the count as "(3 Tasks)", then the rows, or "Nothing due"; Pinned and Reminders hide when empty.
- `TaskRow`: one task, coloured by alert state.
- Prettier: single quotes, no semicolons (`web/.prettierrc.json`, applies to `web/` only).

### 3.4 Verify

- [x] `npm test` (14 tests), `npm run lint` and `npm run build` pass (from `web/`).
- [x] Seed with 20:00 deadlines passes every schema rule, including on both DST change days.
- [x] `docker compose down -v`, `docker compose up --build`, open <http://localhost:8000>: header says Maverick; Pinned 3, Today 9, Tomorrow 3, Reminders 1.
- [x] Pinned shows all three pinned tasks, including the two not due today.
- [x] Overdue rows are red; the reached reminders (machine shop, night currency flight, nose wheel tire) are amber.
- [x] No archived or completed task appears; the two snoozed tasks show "Snoozed until …".
- [x] Local dev: `npm run dev` serves the page and the `/api` proxy reaches the API.

Verified 2026-11-17 at 18:28 New York time, rendered in headless Chrome.
