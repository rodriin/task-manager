# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A full-stack take-home for STR Mission Applications, specified in `REQUIREMENTS.md`. The task is to build a working "first cut" that an engineer would demo to a prospective user, Maverick, a Navy pilot who runs a detachment. There's no spec, only his discovery-call notes (Appendix A of `REQUIREMENTS.md`). In the review, the author demos the app as if to Maverick and then defends every call made, so the code has to be something they can explain and stand behind.

**The customer's problem.** His tasks are spread across sticky notes, email flags, a whiteboard and his memory. He wants one place for everything. But he shuts any app that shows him the whole pile. He hates notifications, yet things that go quiet burn him: he missed a maintenance sign-off. He asks for a pilot's "scan": always knowing what's now and what's next. Rhythm items (Monday brief, Friday roll-up, quarterly currency paperwork) get re-entered by hand every time. Squadron and delegation features are "someday", not day one. He doesn't care about looks; he wants to feel ahead of the jet.

Every feature should trace back to one of these tensions:
- Everything in one place, but he can't look at everything. So the app opens on Today, and the full list is one click away.
- He hates pings but gets burned by silence. So alerts stay in the app, and snooze quiets an alert but never hides the task.
- Re-entering rhythm items by hand. Clone is the first answer to that.

The design decisions and the reasoning behind them are in `DECISIONS.md`.

**Hard constraints from the brief:**
- `docker compose up` on a machine with only Docker must start everything, app and database. It runs locally only: no deploying, no cloud services, no external APIs.
- The time box is 3–4 hours. Prefer cutting scope to half-building a feature. Items 1–7 in the README's priority list come before the "if time allows" items.
- `PREBRIEF.md` must be **human-written**. Don't write or rewrite its prose. At most, point out facts the author may want to add.
- `DECISIONS.md` is a running log kept *during* the build, not reconstructed at the end. Reviewers read it first. When a real choice gets made (something considered, chosen and why), add an entry under a new `##` section at the bottom (bold lead-in, then a few plain sentences, matching the existing entries), or suggest the entry so the author can write it. Don't backfill or polish earlier entries.
- `README.md` must keep the one command to run the app.

Progress is tracked in `PLAN.md` (parts of planned work, not strict commits); keep it accurate as work changes. Built so far: the models and seed, the JSON API (`/api/me`, `/api/tasks` list/create/update), and the read-only scan screen.

## Commands

Reviewers use the Docker path, so it's the one that must keep working. After changing dependencies, check it with `docker compose up --build`.

```bash
docker compose up --build          # full app at http://localhost:8000
docker compose down -v --rmi local # wipe the DB and the built app image: next start rebuilds and re-seeds (the reviewer's first run)

# Local dev with hot reload (three terminals)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db   # Postgres on :5432
cd api && source .venv/bin/activate && fastapi dev main.py             # API on :8000, docs at /docs
cd web && npm run dev                                                  # UI on :5173, proxies /api -> :8000

# Web checks (run from web/)
npm test                           # vitest run (jsdom, globals, setup in src/test-setup.ts)
npx vitest run src/path/to.test.ts # single file
npx vitest run -t "name"           # single test by name
npm run lint                       # oxlint (not ESLint)
npm run build                      # tsc -b + vite build; this is the type-check
npm run format                     # prettier on src (single quotes, no semicolons: web/.prettierrc.json; web only)
```

There are no API tests. That was deliberate: UI tests target derived status and date logic.

## Architecture

- **Two containers.** `db` (Postgres 17) and `app`. The Dockerfile builds the React app in stage 1 and copies `web/dist` into `api/static`. FastAPI mounts that at `/` after all routes. All API routes must live under `/api/*` and be registered **before** the static mount at the bottom of `main.py`. There is no CORS and no proxy in production. In dev, Vite proxies `/api`.
- **No migration tool.** `SQLModel.metadata.create_all` runs in the FastAPI lifespan. Table classes must be imported before it runs.
- **`schema.sql` is the reference schema, not what runs.** `create_all` won't create its CHECK constraints or partial index unless the SQLModel models declare them (for example with `__table_args__`). Keep the models and `schema.sql` in sync. The database uses snake_case columns, and the JSON API uses camelCase (`remindAt`, `ownerId`, `snoozedUntil`, ...).
- **Seeding.** On startup, if `tasks` is empty, insert `api/seed/users.seed.json`, then `tasks.seed.json`, via `api/seed/materialize_seed.py`. The seed stores *day offsets*, not dates. They're resolved against "today" in `DEMO_TZ` (default `America/New_York`), because the container clock is UTC. Never put fixed dates in the seed. The seed must also pass the schema checks. Default local times when the seed gives only a day: deadline 20:00 (Eastern 20:00 = Pacific 17:00, and an evening demo isn't all red), reminder and snooze 07:00. Changing the seed needs `docker compose down -v` to re-seed.
- **Frontend.** React 19 + TypeScript + Vite, TanStack Query for server state, TanStack Table **v9** for sorting, filtering, search and pagination (all "if time allows" items). Table v9's API differs from most v8 examples. Styling is Tailwind v4 (Vite plugin) and dates use date-fns. The plan says no router, no state store and no form library: use `useState` for the active tab (Today / All) and the open task. The client loads all tasks, archived ones included, in one request.
- **Web code layout.** `src/api/client.ts` holds the fetch calls (ISO strings become `Date`s only here); `src/types.ts` at the top; `src/useNow.ts` (clock hook) at the top too; `src/helpers/` holds plain functions with no React, and their tests (`taskHelpers.ts`, `taskHelpers.test.ts`); `src/components/` holds the UI pieces (`TaskSection`, `TaskRow`). Keep things that are used together, together.
- **Single user.** There's no auth. The API acts as the one seeded user (id 1). Display name is `preferredName` if set, otherwise first + last name.

## Domain rules (easy to get wrong)

- **Completed and Overdue are derived, never stored.** Completed means `completedAt` is set. Overdue means the deadline has passed and the task isn't completed. Stored `status` is only `Not Started` | `In-Progress`. Un-completing a task restores its prior status.
- **Timestamps are UTC in storage, shown in local time.** "Today" and "Tomorrow" are the *viewer's* local day, computed in the UI. A task is overdue the minute its deadline passes.
- **Alerts are in-app only; nothing buzzes.** A task alerts when its deadline is within the next 24 hours, its deadline has already passed (overdue), or its `remindAt` has been reached. It keeps alerting until it's completed, archived or snoozed. An overdue task must never go quiet by itself: that's the missed sign-off.
- **The scan (opening screen), top to bottom:** **Pinned** (every open pinned task, whatever its dates), **Today** (deadline before the end of today, overdue included), **Tomorrow** (deadline tomorrow), **Reminders** (reminder already reached, and none of the above: deadline later or none). Only open tasks; each task appears in one section only, the first it qualifies for. A reminder that hasn't fired yet shows nowhere in the scan. Pinned and Reminders hide when empty. Logic lives in `web/src/helpers/taskHelpers.ts` (`buildScan`).
- **Order:** Pinned and Today put overdue first, then by deadline; Tomorrow by deadline; Reminders oldest reminder first; no deadline sorts last. The order is a guess to check with Maverick.
- **Colour means alert state:** red = overdue, amber = reminder reached and not overdue. Don't use red or amber for anything else (the High tag is neutral).
- **Times are 24-hour** (`HH:mm`), with the day added when it isn't today.
- **Snooze** writes only `snoozedUntil` (counted from now). It never changes `remindAt`. A snoozed task stays visible, with a "snoozed until" marker. The snooze options are "3 hours" and "tomorrow morning" (both guesses to check with Maverick).
- **Moving a deadline before its reminder** shifts `remindAt` by the same amount, and the form shows the new time before saving. Don't reject the edit and don't clear the reminder.
- **Archiving** happens in the task edit form, by setting `archivedAt`; there is no separate archive action. Archived tasks **stay in the full list**, marked as archived, until filters exist to hide them. They never appear in Today and Tomorrow and never alert. The same save that archives a task must also set `pinned = false` and `snoozedUntil = null`, or the DB checks reject it. Un-archiving clears `archivedAt`.
- **Clone** is a create that copies fields. Complete, snooze, pin and archive are updates. Keep the API thin: list, create, update.
- `category` and `type` are nullable plain text columns. There's no categories table, on purpose.
- The DB enforces: reminder ≤ deadline when both are set (a reminder with no deadline is valid and expected); snooze needs a deadline or a reminder; snooze > reminder; no snooze on completed or archived tasks; no pin on archived tasks. The DB deliberately does **not** enforce "in the future" or `completedAt >= createdAt`, so past work can be logged.
