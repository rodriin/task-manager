# Task Manager

A first cut of a single place for a detachment officer-in-charge to keep every task, built for the STR Mission Applications · Full Stack Take-Home.

See [PREBRIEF.md](PREBRIEF.md) for what we heard and what we built, [DECISIONS.md](DECISIONS.md) for the running log of choices made along the way, [PLAN.md](PLAN.md) for the implementation plan, and [REQUIREMENTS.md](REQUIREMENTS.md) for the provided prerequisites behind this code base and project.

## Run it

Requires Docker only.

```bash
docker compose up
```

Then open <http://localhost:8000>.

The first run builds the image, creates the database tables and loads the sample data. Sample dates are generated relative to the day you first start it, so there are always tasks due today, tasks due tomorrow and a few overdue.

| Command | What it does |
|---|---|
| `docker compose up` | Start the app and database |
| `docker compose up --build` | Rebuild the image after a code change |
| `docker compose down` | Stop and remove the containers, keep the data |
| `docker compose down -v --rmi local` | Stop and delete the data and image, so the next start rebuilds and re-seeds |

### Configuration

No setup is needed. One optional setting:

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_TZ` | `America/New_York` | Time zone used to decide what "today" means when the sample data is generated |

Example app start command: `DEMO_TZ=America/Los_Angeles docker compose up`

`DEMO_TZ` takes an IANA time zone name, such as `Europe/London` or `Asia/Tokyo`. Names are case-sensitive. See the [list of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (use the "TZ identifier" column).

### Look at the data

With the app running, open a SQL prompt inside the database container (no local Postgres needed):

```bash
docker compose exec db psql -U taskmanager -d taskmanager
```

Columns are snake_case in SQL (`remind_at`, `owner_id`) and camelCase in the JSON API (`remindAt`, `ownerId`). Timestamps are stored in UTC; set the session time zone to read them in local time:

```sql
SET timezone = 'America/New_York';

-- Open tasks in deadline order, with the derived overdue flag.
SELECT id, title, deadline, remind_at, status, deadline < now() AS overdue
FROM tasks
WHERE completed_at IS NULL AND archived_at IS NULL
ORDER BY deadline NULLS LAST;

-- Table definition, including the rules the database enforces.
\d tasks
```

Type `\q` to leave. More checks are in [PLAN.md](PLAN.md).

## First-cut scope

In priority order. Anything beyond these will be built only if time allowed; see DECISIONS.md for where the split ended up.

1. Today and tomorrow view: what is now and what is next
2. Full task list with the minimum useful information per row
3. Task detail and edit
4. New task and clone (first answer to the recurring items)
5. Alert for tasks that are overdue, due very soon, or past their reminder time
6. Snooze an alert
7. "You're caught up" message when today is clear
8. Pin tasks to the top of the today view
9. Pagination
10. Sort
11. Filter
12. Search

If time allows: print today's tasks.

## Architecture

```
            browser
               |
               v  http://localhost:8000
   +-------------------------+        +--------------------+
   | app                     |        | db                 |
   | FastAPI + Uvicorn       | -----> | Postgres 17        |
   |  /api/*   JSON API      |        | volume: db-data    |
   |  /*       built React UI|        +--------------------+
   +-------------------------+
```

Two containers. The React app is built in a Docker build stage and served by FastAPI as static files, so the UI and the API share one origin and there is no proxy or CORS configuration.

| Layer | Choice |
|---|---|
| Database | Postgres |
| API | Python, FastAPI, SQLModel, psycopg |
| UI | React, TypeScript, Vite |
| Server state | TanStack Query |
| Table | TanStack Table (client-side sort, filter, search, pagination) |
| Styling | Tailwind CSS |
| Dates | date-fns |
| Tests | Vitest, React Testing Library |

### Data model

Two tables. The full definition, including the rules the database enforces, is in [`schema.sql`](schema.sql).

**users**

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `firstname` | text, required | |
| `lastname` | text, required | |
| `preferredName` | text, optional | Override for the default display name |
| `createdAt` | timestamp | |

The display name is `preferredName` when available, otherwise `firstname` + `lastname`.

**tasks**

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `title` | text, required | Short text shown in lists |
| `description` | text, optional | |
| `deadline` | timestamp, optional | |
| `status` | `Not started` or `In progress` | Completed and Overdue are derived, not stored |
| `category` | `Admin`, `Supply`, `Flight`, `Personal` or empty | |
| `type` | `Follow-up`, `Reminder`, `Sign-off`, `Recurring` or empty | |
| `priority` | `Low`, `Medium`, `High` | Defaults to Low |
| `remindAt` | timestamp, optional | Never later than the deadline |
| `snoozedUntil` | timestamp, optional | Quiets the alert, does not hide the task |
| `pinned` | boolean | |
| `ownerId` | reference to users | |
| `createdAt` | timestamp | |
| `completedAt` | timestamp, optional | Set means completed |
| `archivedAt` | timestamp, optional | Set means archived |

All timestamps are stored in UTC and shown in the viewer's local time.

- **Completed** = `completedAt` is set.
- **Overdue** = the deadline has passed and the task is not completed.

### Project layout

```
.
├── docker-compose.yml       # db + app, the one command
├── docker-compose.dev.yml   # exposes Postgres for local development
├── Dockerfile               # stage 1 builds the UI, stage 2 runs the API
├── schema.sql               # reference schema with constraints
├── api/
│   ├── main.py              # app start-up: tables, seed, routes, then the built UI
│   ├── db.py                # database connection and session
│   ├── models.py            # tables; mirror schema.sql, checks included
│   ├── schemas.py           # JSON shapes for the API (camelCase)
│   ├── routes.py            # /api/me and /api/tasks (list, create, update)
│   ├── requirements.txt
│   └── seed/                # sample data, the script that dates it, and the loader (load.py)
└── web/                     # Vite + React app
    └── src/
        ├── App.tsx          # two tabs: Today (the scan) and All tasks (the full table)
        ├── api/client.ts    # fetch calls to /api
        ├── types.ts
        ├── useNow.ts        # clock that ticks every minute
        ├── helpers/         # plain task logic (overdue, reminders, sections, edit form rules) and tests
        └── components/
            ├── scan/        # the Today screen: TaskSection and TaskLine (one task in a section)
            ├── table/       # the All tasks table and its toolbar
            ├── dialog/      # task detail, edit, new task and clone (TaskDialog) and its form fields
            └── shared/      # pieces used by more than one view (Tag, NewTag, TitleButton, Toasts)
```

## Local development

Only needed if you want hot reload. Requires Node 22 or newer and Python 3.13 or newer.

One-time setup (from root folder):

```bash
cd web && npm install && cd ..
cd api && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
```

Then in three terminals (from root folder):

```bash
# 1. Database only, exposed on localhost:5432
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db

# 2. API with reload, http://localhost:8000 (interactive docs at /docs)
cd api && source .venv/bin/activate && fastapi dev main.py

# 3. UI with hot reload, http://localhost:5173 (forwards /api to the API)
cd web && npm run dev
```

### Checks

```bash
cd web
npm test        # unit tests
npm run lint
npm run build   # type-check and production build
npm run format  # Prettier: single quotes, no semicolons
```

## Known limits

- Single user. There is no login; the API acts as the one seeded user.
- Sorting, filtering, search and pagination run in the browser. That is fine for hundreds or a few thousand tasks and would move to the server beyond that.
- No migration tool yet. Tables are created at startup.
- Sample data is dated once, when the database is first seeded. On a later day, run `docker compose down -v` and start again to re-date it.
