# Build plan

Working plan for the build, split into parts. A part is a unit of planned work, not a strict commit: it may land as several smaller commits, alongside bug fixes, and this file may catch up a few commits later. It is updated as the plan changes; the reasoning behind choices lives in `DECISIONS.md`.

| Part | Scope | Status |
| --- | --- | --- |
| 1 | Data seed: models and seed loader | Done |
| 2 | API routes: list, create, update | Done |
| 3 | UI: the scan (Pinned, Today, Tomorrow, Reminders), read-only | Done |
| 4 | UI: All tasks tab, a full table with search, filters, sort and pages | Done |
| 5 | UI: task detail and edit, in a dialog | Built and verified, ready to commit |
| 6+ | Not planned yet | — |

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
- [x] `POST /api/tasks` with only a title returns 201, an id of 67 or more, `ownerId: 1`, `status: "Not started"` and `priority: "Low"`.
- [x] `POST` with `remind_at` (snake_case), a time with no time zone, or a blank title returns 422.
- [x] `PATCH` pinned task 10 with `archivedAt` returns 200 with `pinned: false`.
- [x] `PATCH` snoozed task 11 with `completedAt` returns 200 with `snoozedUntil: null`. Then `completedAt: null` gives back its original status (also checked on In progress task 2).
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

---

## Part 4: All tasks tab

**Goal:** a second tab, **All tasks**, shows every task ever entered (open, completed and archived, any date) in one table, built with TanStack Table v9 so search, filters, sorting and pages come with little code. The scan stays the opening screen.

**Out of scope:** opening or editing a task from a row (detail and edit is the next part), clone, page size choice, saving filters between visits, server-side paging.

### Rules

- **Tabs:** "Today" (the scan, default) and "All tasks", in the header. `useState` in `App`, no router. Switching tabs keeps the table's search, filters, sort and page.
- **Everything is in the table:** open, completed and archived. Nothing is hidden until a filter hides it.
- **Pinned tasks are ordinary rows here.** The scan already has a Pinned section; in the table, the Pin column can be sorted like any other.
- **Search, filters and sort work together:** search and filters narrow the rows, the sort orders what's left, then it's split into pages.
- **Search** looks in title, description, category, type and priority, case-insensitive, as you type. That covers category, type and priority without a dropdown each ("supply", "sign-off", "high").
- **Filters** (two dropdowns):
  - **Status:** All (default), Open, Not started, In progress, Completed, Archived. Open = not completed and not archived (Not started plus In progress, overdue or not). Not started and In progress are the stored status of open tasks.
  - **Deadline:** Any (default), Overdue, Today, Tomorrow, This week, This month, This quarter, Later, No deadline. Today and Tomorrow are calendar days; This week (Monday to Sunday), This month and This quarter are the whole calendar period, past days included, so the weekly and quarterly rhythm items show whether they are coming, overdue or done; calendar quarters line up with the US federal fiscal quarters; the options overlap; Later is after the end of this quarter; Overdue is deadline passed and not completed.
- **Not filters, on purpose:** pinned and "has a reminder". Sorting the Pin or Reminder column groups them instead (pinned first; empty reminders last).
- **Sort:** click a column heading; the first click is always ascending (pinned first, A to Z, earliest first), a second reverses, a third clears. Any new sort goes back to page 1. Default: no sort, so rows come in the API's order (by id, the order they were entered); clearing a sort returns to it. Empty dates sort last in either direction.
- **Pages:** 10 rows per page, Previous / Next, "Page 2 of 7", and the count of matching tasks. Changing search or a filter goes back to page 1.
- **Colour:**
  - red = overdue, amber = reached reminder, same as the scan (open tasks only);
  - completed rows are muted green: done, something good;
  - archived rows are muted grey.
- **Empty result:** "No tasks match" with a button to clear search and filters.
- **Accessibility:**
  - every field has a `<label htmlFor>` (the search label is visually hidden; a placeholder is not a label);
  - the toolbar is a search landmark; the count, page number and "No tasks match" are announced (live regions);
  - tabs follow the ARIA tabs pattern: `tablist`/`tab`/`tabpanel`, Tab reaches the selected tab, arrow keys, Home and End switch;
  - sortable headings are buttons, with `aria-sort` and `scope="col"`; the arrows are hidden from screen readers; the table has a visually hidden caption;
  - the pin emoji is `role="img"` with a label; overdue is a word ("Overdue"), not only red;
  - a visible focus ring on everything focusable (`index.css`).

### Layout

One toolbar row above the table, wrapping on narrow screens:

```
[ Search title, notes, category…        ]  Status [All ▾]  Deadline [Any ▾]  Clear     23 tasks
```

### Columns

| Column | Shows | Sort |
| --- | --- | --- |
| Pin | pin marker | pinned first, then reversed |
| Title | title | A–Z |
| Status | Not started, In progress, Completed, Archived; red "Overdue" tag when overdue | by that order |
| Priority | Low, Medium, High (High stays neutral) | by rank, not alphabet |
| Category | category or blank | A–Z |
| Type | type or blank | A–Z |
| Deadline | date and 24-hour time | by time |
| Reminder | date and time, amber when reached | by time |
| Completed | date | by time |
| Created | date | by time |

### 4.1 Helpers: `web/src/helpers/taskHelpers.ts`

- `alertState(task, now)`: `'overdue'`, `'reminder'` or none; open tasks only. Used for colour by both the scan rows and the table.
- `taskStatus(task)`: Archived, Completed, In progress or Not started, in that order of precedence.
- Stored status renamed from `Not Started` / `In-Progress` to `Not started` / `In progress`, the words the UI shows, so `taskStatus` returns it with no mapping. Changed in `schema.sql`, `api/models.py` (check and default), `api/schemas.py`, the seed, and `web/src/types.ts`. Needs `docker compose down -v` to recreate the table rule and re-seed. Verified: the database rule lists the new values, the seed loads (38 Not started, 28 In progress), the API defaults to `Not started` and rejects the old `In-Progress` with 422.
- `matchesStatus`, `matchesDeadline(task, filter, now)` and `matchesSearch`: one function per filter. A task can match both Overdue and Today (overdue earlier today); each option is checked on its own.
- `web/src/helpers/formatDates.ts`: `when` (time, day and time, or with the year when not this year) and `day`, shared by the scan and the table.
- Tests added to `taskHelpers.test.ts`.

### 4.2 Table: `web/src/components/TaskTable.tsx`

- `useTable` (v9) with sorting, column filtering, global filtering and pagination. The table stays mounted (hidden) when the Today tab is shown, so its state survives tab switches.
- Column definitions next to the table. Date columns return `undefined` for empty dates, so `sortUndefined: 'last'` puts them at the end in both directions. Status and Priority sort by rank.
- Columns are rebuilt when the clock ticks (overdue and "today" depend on it), so the automatic page reset is off; search, filter and sort changes reset to page 1 themselves.
- `sortDescFirst: false`: TanStack would otherwise sort number columns descending on the first click.
- `Tag.tsx`: the small label (High, In progress, Overdue), now shared by `TaskRow` and the table.
- `TaskTable.test.tsx`: pages, the default sort, Pin sort, search plus filters plus sort, and the empty result.

### 4.3 Toolbar: `web/src/components/TaskTableToolbar.tsx`

- Search box, the two filters, Clear, and the count.

### 4.4 Screen: `web/src/App.tsx`

- Tab buttons in the header; the scan and `TaskTable` use the same `tasks` query (no second request).

### 4.5 Verify

- [x] `npm test` (29 tests), `npm run lint`, `npm run build` pass.
- [x] Helper tests: each status, and each deadline option around midnight and the end of the week.
- [x] In the app: All tasks shows 66 tasks across 7 pages.
- [x] Status = Archived shows the 13 archived tasks; Completed shows the 8 completed and not archived ones, in muted green (archived wins over completed); Open shows none of either.
- [x] Deadline = No deadline shows the 9 tasks without one; Open plus Overdue shows 10 red rows with the Overdue tag.
- [x] Search "tow" finds the 2 tow bar tasks; "supply" finds 11; search plus a Title sort combine; Clear resets.
- [x] Sorting Pin puts the 3 pinned tasks first and goes back to page 1.
- [x] Switching to Today and back keeps the table's search, sort and page; the Today tab still shows Pinned 3, Today 9, Tomorrow 3, Reminders 1.
- [x] Phone width (390px): the toolbar wraps and the table scrolls inside its box; the page itself doesn't scroll sideways.
- [x] `docker compose up --build` serves it at <http://localhost:8000>.
- [x] No default sort: page 1 is ids 1 to 10, current work (overdue, today, a reminder), not old archived tasks.
- [x] This week 18, This month 36, This quarter 42, Later 4, matching a count from the API data; This week plus "roll-up" finds Friday's status roll-up.
- [x] Keyboard only: Tab lands on the selected tab, ArrowRight selects All tasks, the next Tab reaches the search box with a visible focus ring. Each label points at its field.

Verified 2026-11-17 at 23:32 and 2026-11-18 at 07:07 New York time, driven in headless Chrome.

---

## Part 5: Task detail and edit

**Goal:** click a task's title, in the scan or the table, and a dialog opens with everything about it. Every field can be changed there, including completing and archiving, and one Save sends it. This is item 3 of the priority list, and the first time the UI writes.

**Out of scope:** New task and Clone (next part; the form is built so both can reuse it), snooze buttons (snooze is an action with preset times, not a form field; the dialog only shows "Snoozed until …"), the alert banner, the "caught up" message, pin from a row, an activity history.

### Rules

- **One dialog, opens on the form.** No separate read-only view and no Edit button: the fields show the task, and changing one is the edit. Derived facts sit above the fields as plain text: the alert state (red "Overdue" / amber "Reminder"), "Snoozed until …", Created, Completed and Archived dates.
- **Opened from the title.** In `TaskLine` (the scan) and the table's Title cell, the title becomes a `<button>` styled as text. Not a click on the whole row: a button is reachable by keyboard and announced by screen readers.
- **Native `<dialog>` with `showModal()`.** The browser gives the focus trap, Escape to close, the backdrop, and makes the page behind inert. Focus starts on the title field and returns to the title button on close.
- **Which task:** `App` keeps `openTaskId` in `useState` and finds the task in the `tasks` query data. The form copies the task once when it opens (`key={task.id}`), so a background refetch doesn't wipe what's being typed.
- **Fields:**

  | Field | Input | Notes |
  | --- | --- | --- |
  | Title | text, required, up to 120 | trimmed |
  | Description | textarea, up to 5000 | empty saves as null |
  | Status | select: Not started, In progress | the stored status; kept when completed |
  | Priority | select: Low, Medium, High | |
  | Category | select: none, Admin, Supply, Flight, Personal | none = null |
  | Type | select: none, Follow-up, Reminder, Sign-off, Recurring | none = null |
  | Deadline | date picker + time `HH:mm` + Clear | time defaults to 20:00 when a date is picked |
  | Reminder | date picker + time `HH:mm` + Clear | time defaults to 07:00 |
  | Pinned | checkbox | disabled while Archived is ticked |
  | Completed | checkbox | ticking sets `completedAt` to now; unticking clears it |
  | Archived | checkbox | ticking sets `archivedAt` to now, unticks Pinned and locks every other field |

- **24-hour times:** the time is a text field (`HH:mm`, `inputMode="numeric"`), because the browser's own time picker shows AM/PM on a US machine. The date uses the native date picker. Date plus time are read as local time and sent as UTC.
- **Moving the deadline before the reminder** shifts the reminder by the same amount, and the form shows "Reminder moves to …" under the field before saving.
- **Adding a first deadline before an existing reminder** (no old deadline, so no amount to shift by) moves the reminder to the day before the deadline, at the reminder's original time, so there's at least a day to act. Same "Reminder moves to …" note. If that time has already passed, the reminder is simply reached (amber) once saved.
- **Typing a reminder after the deadline** is the only case that's an error: the form says "The reminder can't be after the deadline" and Save is disabled. The shift only applies when the deadline changed and the reminder field wasn't edited; a reminder he typed himself is never moved for him.
- **Archived locks the form.** Archiving is a soft delete, so an archived task isn't edited by accident. Whenever Archived is ticked, every other field is disabled (one `<fieldset disabled>` around them), and a line above says "Archived on 3 Nov. Untick Archived to edit."
  - **Opening an archived task:** everything is locked. Unticking Archived unlocks the fields; the edits and `archivedAt: null` go in one save.
  - **Re-ticking Archived on an archived task** puts every field back to its stored value, visibly, and locks them. Edits made while it was unticked are dropped, so the save changes nothing.
  - **Archiving an open task keeps the edits** made before ticking, and saves them with the archive in one step (wrap up the title, then archive). Pinned unticks, matching the server; unticking Archived again restores Pinned to what it was.
  - **Unarchiving can bring an alert straight back:** a task whose deadline has passed is red as soon as it's restored. Correct, since overdue never goes quiet.
  - **Completed tasks are not locked.** Completing is reversible, and fixing a typo or a date on finished work is reasonable.
- **Changing the deadline or the reminder ends a running snooze**, in the same save (`snoozedUntil: null`). A stored snooze that has already run out is cleared too: the database still checks it against the reminder. The form says "Snooze ends: the dates changed" before saving. He has re-planned the task, so the alerts follow the new dates. This also covers the edits the database would otherwise reject on a snoozed task: clearing both dates, or moving the reminder past the snooze time.
- **Save sends only what changed** (a PATCH with the changed fields). Nothing changed: Save is disabled. The server already clears pin and snooze on archive, and snooze on complete.
- **After saving:** the returned task replaces the old one in the query cache (no refetch), and the dialog closes. The scan and the table update straight away: completing a task drops it from Today, archiving drops it from the scan.
- **When the save fails:** the dialog stays open with the typed values, and a message in plain words. A 422 with a constraint name maps to a sentence (`remind_not_after_deadline` → "The reminder can't be after the deadline."); anything else shows the API's message. The message is a live region.
- **Cancel, Escape or the backdrop** close without saving. No "discard changes?" prompt in the first cut.

### Layout

```
┌ Edit task ─────────────────────────────────────── ✕ ┐
│ Overdue · was due Mon 16 Nov 20:00   Created 2 Nov  │
│                                                     │
│ Title        [ Tow bar inspection               ]   │
│ Description  [                                  ]   │
│ Status [In progress ▾]  Priority [High ▾]           │
│ Category [Supply ▾]     Type [Sign-off ▾]           │
│ Deadline [ 2026-11-16 ] [20:00] Clear               │
│ Reminder [ 2026-11-16 ] [07:00] Clear               │
│   Reminder moves to Sun 15 Nov 07:00                │
│ [ ] Pinned   [ ] Completed   [ ] Archived           │
│                                                     │
│                              [Cancel]  [Save]       │
└─────────────────────────────────────────────────────┘
```

On a phone the fields stack in one column.

### 5.1 API: `web/src/api/client.ts`

- `updateTask(id, patch)`: `PATCH /api/tasks/{id}` with JSON; `Date` values become ISO strings, `null` stays `null`. Returns the parsed task (`parseTask`).
- An `ApiError` carrying the status and the `detail`, so the form can map constraint names to messages.

### 5.2 Form helpers: `web/src/helpers/taskForm.ts` (+ `taskForm.test.ts`)

Plain functions, no React:

- `toFormValues(task)` and `FormValues` (strings and booleans, what the inputs hold).
- `parseLocal(date, time)`: `Date` or null; rejects a time that isn't `HH:mm`.
- `shiftReminder(oldDeadline, newDeadline, remindAt)`: the reminder to save and whether it moved. Shifts by the same amount when there was an old deadline; with none, the day before the new deadline at the reminder's own time.
- `toPatch(task, values, now)`: only the changed fields, with Completed and Archived turned into timestamps (or null), `pinned: false` when archiving; for a task that is stored as archived and still ticked, an empty patch whatever else the form holds; and `snoozedUntil: null` when the task has any `snoozedUntil` (running or expired) and the deadline or reminder changed.
- `formErrors(values)`: title empty or too long, bad time, reminder after deadline.
- `constraintMessage(name)`: plain sentences for the `schema.sql` constraint names.

Tests: shift by the same amount across midnight and a DST change; no shift when the reminder is still before the deadline; first deadline before a reminder moves it to the day before, same time of day (including across a DST change); a hand-typed reminder after the deadline is an error, not shifted; untouched form → empty patch; clearing a field sends null; completing and un-completing; archiving unpins; archiving an open task keeps the other edits; an archived task re-ticked after edits gives an empty patch; unarchiving plus edits is one patch with `archivedAt: null`; changing the deadline or reminder of a snoozed task clears the snooze (an expired one too), other edits (title, status) leave it; bad times rejected; default times 20:00 and 07:00.

### 5.3 Dialog: `web/src/components/dialog/` (`TaskDialog.tsx` + `TaskDialog.test.tsx`)

- The `<dialog>` and the form; `useMutation` calling `updateTask`, then `setQueryData(['tasks'], …)` and close.
- Its parts in their own files: `TaskFacts`, `DateTimeField`, `Select`, `Checkbox`, `FieldError`, and `styles.ts` (Save is the blue primary button; Clear looks like the table toolbar's Clear).
- Every input has a `<label htmlFor>`; the date and time pair sit in a `fieldset` with a `legend`.
- jsdom doesn't implement `showModal`, so `test-setup.ts` gets a small stub if it's missing.
- Tests: opens with the task's values; editing the title sends only `{ title }`; moving the deadline shows the reminder note and sends both; a 422 shows the message and keeps the dialog open; Cancel sends nothing; an archived task opens with every field but Archived disabled and the "Untick Archived to edit" line; re-ticking Archived restores the stored values; ticking Archived on an open task disables the fields but keeps the typed title.

### 5.4 Opening it: `TaskLine.tsx`, `TaskSection.tsx`, `TaskTable.tsx`, `App.tsx`

- An `onOpen(id)` prop down to `TaskLine` and the table's Title cell; the title renders as a button (`shared/TitleButton.tsx`, shared by both).
- Components grouped in folders: `scan/` (`TaskSection`, `TaskLine`), `table/` (`TaskTable`, `TaskTableToolbar`), `dialog/`, `shared/` (`Tag`, `TitleButton`). `TaskRow` (Part 3) is renamed `TaskLine`: it is one task in a scan section, and the old name read like a table row.
- `App` holds `openTaskId` and renders `TaskDialog` when it's set and the task exists.
- Existing `TaskTable` tests keep passing (title text is still found).

### 5.5 Verify

- [x] `npm test` (65 tests), `npm run lint`, `npm run build` pass.
- [x] Click a title in Today: the dialog opens with focus on Title; Escape closes it and focus is back on that title.
- [x] Same from the All tasks table; the table's search, sort and page are unchanged after closing.
- [x] Change a title and save: the row updates without a reload; the network tab shows a PATCH with only `title`.
- [x] Tick Completed on a Today task: it leaves Today, shows as Completed (green) in the table; untick it and it comes back with its old status.
- [x] Tick Archived on a pinned task: Pinned unticks and the fields lock; after saving it's gone from the scan and Archived in the table.
- [x] Open task: change the title, tick Archived, save: one save, archived with the new title.
- [x] Open an archived task: only Archived can be changed. Untick it, edit the title, re-tick: the old title is back and Save is disabled. Untick, edit, save: unarchived with the new title.
- [x] Unarchive a task whose deadline has passed: it's red in Today straight away.
- [x] Move a deadline earlier than its reminder: "Reminder moves to …" shows; after saving both are moved by the same amount.
- [x] Add a deadline before its reminder on a task with a reminder and no deadline (the helmet visor): "Reminder moves to …" shows the day before the deadline, at the reminder's original time.
- [x] Set a reminder after the deadline by hand: the error shows and Save is disabled.
- [x] On a snoozed task, change the deadline: "Snooze ends: the dates changed" shows; after saving the "Snoozed until" marker is gone and the alert is back if the new dates call for one.
- [x] On a snoozed task, clear both the deadline and the reminder: it saves (no constraint error) and the snooze is gone.
- [x] Times show and are typed as 24-hour.
- [x] Keyboard: Enter on a title opens, Escape closes and focus returns, the time field is typed and normalised ("730" → 07:30). Phone width (390px): the form is one column and fits. Also fixed here: the All tasks search box had `min-w-110`, which made the page scroll sideways on a phone; it's now full width below 640px and keeps that minimum above (checked at 390, 640 and 1280px).
- [x] `docker compose up --build` serves it at <http://localhost:8000>; then `docker compose down -v` to re-seed clean demo data.

Verified 2026-11-18 at 10:48 New York time, driven in headless Chrome against `docker compose up --build`, then re-seeded with `down -v`.
