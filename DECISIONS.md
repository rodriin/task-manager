# Decisions

Running log, newest at the bottom. Written as I went.

---

## Reading the brief, first data model

**How I read the interview.** Maverick does not have a task-list problem; he has a scan problem. Four places to look, nothing tells him what is now and what is next, and things arrive by email or a tap on the shoulder and never get written down. Two contradictions he handed us on purpose: he wants everything in one place but shuts the laptop when he sees everything, and he hates being pinged but gets burned by silence.

**Product name.** Task Manager. Plain and generic on purpose. He said he does not care what it looks like.

**First data model.** Started with description, deadline, status, category, type, priority, reminder, owner, read, archived, notes.

**Sample data uses day offsets, not fixed dates.** The Today view, alerts and overdue all depend on the current date, and I do not control which day the reviewers run it. The seed stores "due in 3 days" and is turned into real dates at startup. Considered: fixed dates (stale within a day), or generating random data (not believable in a demo). Chose 66 hand-written tasks taken from his own examples: the tow bar, the missed sign-off, the Monday brief, the Friday roll-up, the quarterly currency paperwork.

**Overdue is derived, not stored.** A stored "overdue" goes stale overnight and overwrites whether the task was in progress. Computed from the deadline instead.

**Added a title.** With only a description, the list had to truncate long text. Title is required and short; description became optional. A quick capture is now one field, which matters for "somebody grabs my shoulder on the flight line". It also simulates writing on a sticky note since it is short.

**Categories.** Started with managerial, clerical, flight, admin. Clerical and admin overlapped. He described himself as "part pilot, part manager, part supply clerk", so: flight, managerial, supply.

**Scope.** My first feature list had 13 items, too many for three to four hours. Ordered them so I can stop anywhere and still have a demo:
1. Today and tomorrow view
2. Full list
3. Detail and edit
4. Clone
5. Alert for due today or soon
6. Snooze
7. "Caught up" message

If time allows: pin, paginate, sort, filter, search, print.

**Landing view is Today, not the list.** He told us exactly what happens when an app opens on the whole pile. The full list is one click away.

**Deferred on purpose:** tiles, configurable page size, email and text alerts, mobile, AI enrichment, email import, voice capture, templates, delegation, squadron tracking, task approval, task groupings, task dependency, custom flags, notes, bulk updates, persisted filters, dark mode, i18n.

---

## Schema clean-up and stack

**Renamed managerial to admin, added personal.** "Admin" reads better. Personal covers things like renewing a license that belong to him, not the detached unit.

**Dropped the `read` field.** I wanted it because I use "mark unread" in email to mean "come back to this". But every task here is typed in by him, so everything is already read, and pinning plus the Follow-up type covers the same intent. It earns its place when email import exists: imported tasks arrive unread. Left out until then.

**Dropped `notes`.** Once title and description were separate, notes was a second free-text box with no clear job. What notes were really for, a record of what happened along the way, should be a timestamped activity list later. That also serves delegation and approval.

**Status is never empty.** `Not Started` by default, `In-Progress` as the other stored value.

**Completed is derived too.** Added `completedAt`. A task is completed when it has one. Stored status stays as it was, so un-completing a task puts it back where it was. It also gives "what got done this week" for the Friday roll-up for free.

**`archivedAt` instead of an archived flag.** Same information plus when it happened.

**Category back to nullable.** I briefly had a "None" value as the default. Went back to null: if categories become a table later, "None" would be a real row someone could rename or delete. Nulls can be migrated to a default then.

**No categories table yet.** Considered creating it now for future custom categories. Decided against: custom categories may turn out to be per user, and I would be guessing at the shape. Moving from a text column later is a small migration.

**Users table now.** `id`, `firstname`, `lastname`, `preferredName`, `createdAt`. One row. This is the one piece of the squadron future I am paying for today, because changing owner from a string to a reference later means migrating every task. Display name is the preferred name if set, otherwise first and last name. Maverick is a callsign, so it goes in preferred name.

**All timestamps in UTC.** Deadline, remindAt, snoozedUntil, createdAt, completedAt, archivedAt. Consequences I accepted:
- "Today" is the viewer's local day, so the UI works out local start and end of day.
- A task is overdue the minute its time passes, not the next morning.
- The seed needs to know the demo time zone (`DEMO_TZ`), because the container clock is UTC and an evening demo in the US is already tomorrow in UTC.

**Renamed `reminder` to `remindAt`.** Consistent with the other time fields, and "Reminder" is also a type value.

**Types: Follow-up, Reminder, Sign-off, Recurring.** Sign-off because the missed maintenance sign-off is the story he opened with. Recurring marks the rhythm items worth cloning. Recurring is really a property and not a type (a sign-off can recur); it is a stopgap until templates exist.

**What the database enforces.** Row-level checks: reminder not after deadline; a snooze needs a deadline or a reminder; snooze is after the reminder; no snooze on completed or archived tasks; no pin on archived tasks; allowed values for status, category, type, priority; title not blank; owner exists.

**What the database deliberately does not enforce.**
- "Must be in the future" rules. A check cannot depend on the current time, and the seed needs past dates.
- `completedAt` after `createdAt`. Removed this one: logging something today that was finished last week is legitimate.

**Snooze behavior.** Snooze only writes `snoozedUntil`, counted from now, and never touches `remindAt`. Considered letting the alert clear the reminder; rejected because that silences the task for good, which is the "burned by silence" failure. A snoozed task stays visible in Today with a "snoozed until" marker. This is my answer to "I hate being pinged and I keep getting burned by silence": quiet the alert, never hide the task.

**Moving a deadline earlier than its reminder.** Options: reject the edit, clear the reminder, or move the reminder by the same amount. Rejecting punishes a deliberate edit. Clearing removes the one thing protecting the task. Chose to shift the reminder and show the new time in the form before saving.

**Database: Postgres.** Considered SQLite (one file, one less container) and a document store. The data is one uniform table and every feature is a filter, sort or page over it, so SQL. Chose Postgres over SQLite because every item on the later roadmap (squadron, delegation and approval, groupings, dependencies, custom categories) is more relational, not less, and the brief asks for "app and database". Cost: one more container.

**API: Python with FastAPI.** Matches the role's stack. The API is thin, so the language matters little.

**Thin API.** List, create, update. Clone is a create with copied fields; complete, snooze, pin and archive are updates.

**TanStack Table, client-side.** Loading all non-archived tasks in one request gives sort, filter, search and pagination with little code. Would move to server-side queries if the data grew a lot.

**Two containers, not three.** FastAPI serves the built UI. No nginx, no proxy, no CORS, less to go wrong in front of a customer.

**No router, no state library.** Two tabs and a dialog: `useState` for the active tab and the open task. TanStack Query already shares the server data. If this grows, a router comes before a store, for shareable URLs and the back button.

**No Zustand.** TanStack Query owns the server data and the rest is local to one component for the first cut.

**Real-time data.** For the first cut it is just one user, so real-time data is a fetch. When task delegation arrives, refetch on focus and poll, and add Server-Sent Events only if waiting on someone else becomes a real pain point.

**Forms.** One controlled form with a few manual checks. No form library for a single form.

**No migration tool.** Tables are created at startup. Would add a migration tool before the second schema change.

**Skipped:** API tests. UI tests focus on derived status and date logic, where a bug would embarrass me in the demo.

---

## Scaffolding

**Verified one-command start before writing features.** If Docker is broken, better to find out with an empty app.

**It was broken.** `npm ci` failed in the image: `@testing-library/dom` missing from the lock file. It is a peer dependency of React Testing Library; my local npm did not record it and the npm in the image required it. Fixed by installing it explicitly. Lesson for the README: the reviewers' path is the Docker build, so that is the one that has to be tested.

**Postgres port not published in the main compose file.** A reviewer who already runs Postgres would hit a port clash. A separate dev compose file exposes it for me only.

**TanStack Table installed as v9**, the current major, whose setup differs from most v8 examples.

**Lint:** the current Vite template ships oxlint instead of ESLint. Kept it.

---

## Initial scaffolding full review and initial git commit

**Schema constraints:** the schema-level constraints feel too strict to scale later, but I kept them because they protect data integrity from the start.

**Archived tasks stay in the full list.** Archiving is just an edit (set archivedAt), not a separate action yet. Archived tasks show in the full list, marked, because hiding them needs a filter and filters are an "if time allows" item. They stay out of Today and never alert. Archiving also unpins and clears any snooze in the same save, because the schema checks reject an archived task that is pinned or snoozed.

**Overdue tasks keep alerting.** First version of the alert rule was "deadline within 24 hours or reminder reached". As written, a task would stop alerting the moment its deadline passes, which is exactly how the sign-off went quiet on him. Overdue tasks will alert until the task is completed, archived or snoozed.

**Default order for Today's tasks:** overdue, then pinned, then by deadline. Overdue first because that is what already burned him. Pinned next if pinning ships. Everything else by deadline, earliest first. This is a guess; it is on the list to validate with him.

**A reminder without a deadline is valid.** Checked the schema: the reminder-before-deadline rule only applies when both are set. Some tasks have no due date but still need a nudge, such as following up with the machine shop. The sample data already has one.

**schema.sql is the reference, not what runs.** Tables are created by SQLModel at startup, which will not add the checks or the partial index unless the models declare them. The models have to copy schema.sql, or the rules I am relying on will not exist in the running app.

**Testing the reviewer path.** Plain docker compose up reuses an image that is already built, so it can hide a broken build. Before calling something done: docker compose down -v --rmi local, then docker compose up, or better, a fresh clone in a new folder, which also catches files that never got committed.
