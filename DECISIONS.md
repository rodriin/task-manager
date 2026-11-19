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

---

## Initial data seed

**Seed ids are fixed; the id counter is moved past them.** Fixed ids keep every task tied to user 1. Postgres doesn't advance its counter for explicit ids, so without a `setval` the first new task would get id 1 and fail as a duplicate.

**Seed dates are set at the first start.** The seed runs only on an empty database, so on a later day "today" has drifted. `docker compose down -v` re-seeds from the current date. Re-seeding on every start was rejected: it would wipe anything entered during the demo.

---

## API routes

**List, create, update. No delete.** Clone is a create; complete, snooze, pin and archive are updates. Archiving is how a task goes away (in the near future), so nothing is lost.

**Server clears pin/snooze on archive, and snooze on complete.** Otherwise every screen has to remember it or the DB checks reject the save. The checks stay as the backstop.

**Time logic lives in the UI.** "Now", snooze times and the reminder shift depend on the viewer's local day. The server stores and checks.

**Rule violations return 422 with the constraint name.** The names match schema.sql. Unknown fields and times without a time zone are rejected too, so a typo fails loudly.

---

## Today and Tomorrow view

**One screen: Today on top, Tomorrow underneath.** His "scan": now and next at a glance. Tabs would hide "next" behind a click.

**A reminder puts a task in the day it fires.** Otherwise reminder-only tasks never show up in the scan.

**Completed tasks are hidden for now.** Today shows only what's left. An empty Today becomes the "You're caught up" message later.

**The screen's clock ticks every minute.** A task turns Overdue the minute its deadline passes, without a reload, so it can't go quiet while the app sits open.

---

## Pinned and reminder sections, due times

**Pinned section above Today, with every pinned task.** Pinned means too important to be out of sight, so a pinned task shows whatever its dates, and only there.

**Active reminders section below Tomorrow.** Today and Tomorrow are now by deadline only. A reached reminder on a task due later, or with no deadline, goes here instead. This replaces "a reminder puts a task in the day it fires".

**Default due time is 20:00, not 17:00.** 20:00 Eastern is 17:00 Pacific, so an East Coast deadline still covers the West Coast workday. It also keeps an evening demo from being all red.

**24-hour clock.** Military friendly; it's how a flight schedule reads.

**Reminders show only once they've fired.** A reminder that hasn't fired yet stays out of the scan, to avoid noise.

**Color means alert state only.** Red is overdue and amber is a reminder that has been triggered. The High tag stays neutral so it can't be mistaken for an alert.

---

## Full task list view

**Pinned tasks are ordinary rows in the full list.** The scan already has a Pinned section, so the table doesn't need to repeat it.

**Status and deadline are separate filters.** Status is how far the task has got; Deadline is when it's due (Overdue, Today, Tomorrow, This week, Later, None). Overdue is a time question, so it goes under Deadline.

**Two filters plus a broad search.** Search also matches category, type and priority. Sorting the Pin and Reminder columns stands in for yes/no filters, which keeps the toolbar to one row.

**10 rows per page.** This keeps the list short enough to scan without scrolling.

**Completed rows are muted green.** Green means done, which is good news. Red and amber still mean only alerts.

**Archived takes precedence over completed in Status.** A task that is both shows as Archived, so the Completed filter shows only finished tasks that haven't been put away.

**First click sorts ascending, and any change goes back to page 1.** This is predictable, and a new order or filter never leaves the user looking at a middle page.

**The table starts unsorted, in the order tasks were entered.** A deadline sort opened on a page of old archived tasks. Clicking a heading sorts; a third click returns to this order.

**This month and This quarter join the Deadline filter.** He thinks in weekly and quarterly rhythms, such as the quarterly currency paperwork. Calendar quarters match the federal fiscal quarters.

**Accessibility is basic but real:** labelled fields, keyboard tabs, sort state for screen readers, a visible focus ring. It's cheap to do while building, and expensive to add later.

**Week, month and quarter filters cover the whole calendar period.** Monday to Sunday, past days included, so the Friday roll-up and the quarterly paperwork show whether they're coming, overdue or done. Later is after this quarter. They originally started at today; that hid rhythm items that were already done or overdue.

---

## Task detail and edit

**One dialog for detail and edit, opening on the form.** A read-only view with an Edit button is one more click and one more screen to build. The form already shows every field, and the derived facts (overdue, created, completed) sit above it as text.

**A dialog, not a page.** No router, and closing it puts him back exactly where he was in the scan or the table. Used the browser's native `<dialog>`, which handles focus, Escape and the backdrop without a library.

**Complete and archive are checkboxes in the same form.** One Save, one PATCH, one path to test. Quick-action buttons on the rows can come later if the demo shows he wants them.

**24-hour time is typed, not picked.** The browser's time picker shows AM/PM on a US machine, which breaks the 24-hour rule. The date keeps the native picker. Picking a date fills in 20:00 for a deadline and 07:00 for a reminder, the same defaults as the seed.

**Save sends only the fields that changed.** A smaller request, and it can't overwrite a field the form didn't touch.

**Database rule errors are shown in plain words.** The API returns the constraint name; the form turns it into a sentence and keeps what was typed.

**No optimistic updates.** The scan and the table change only after the database has accepted the save. A failed save leaves them showing what is really stored, and the dialog stays open with the edit. Optimistic updates make the screen change instantly, but a failure would flip the task back after the dialog had closed: a change that looks saved and quietly isn't. With one user and a local database, waiting for the server costs almost nothing.

**No "discard changes?" prompt yet.** Cancel and Escape just close. A guess to check with him.

**Adding a first deadline before an existing reminder moves the reminder.** With no old deadline there's no amount to shift by. The initial plan blocked the save, but that rejects a deliberate edit, which is what the shift rule exists to avoid. The reminder moves to the day before the deadline, keeping the time it was set for, and the form shows the new time before saving. One rule with no special cases, and the reminder stays useful: it gives at least a day to act on the task, rather than firing just before it is due. Only a reminder typed in after the deadline himself is an error.

**Snooze is not a field in the edit form.** Snooze is a response to an alert in the app, so it's an action with preset times counted from now (3 hours, tomorrow morning), coming with the snooze part. A free date field would make it one click to quiet an overdue sign-off for a month, which is the silence that is dangerous. The dialog shows "Snoozed until …" as text only.

**Changing the deadline or reminder ends a running snooze.** Editing either one clears the snooze in the same save, and the form says so before saving. When the task has been re-planned, the alerts should follow the new dates, and if they still call for an alert it comes back. It's one rule, the same way completing and archiving already clear a snooze. It also avoids the database rejecting a sensible edit (clearing both dates, or moving the reminder past the snooze). An expired snooze is cleared too, since the database still checks the stored time against the reminder.

**Archived tasks are locked in the dialog.** Archiving is a soft delete, so an archived task shouldn't be easy to change by accident. Every field except Archived is disabled until archived is unticked, with a line saying so. Unticking and editing is still one save. Re-ticking Archived on an archived task puts the fields back to what is stored, visibly, so nothing changes automatically on an already soft-deleted task.

**Archiving an open task keeps the other edits.** Wrapping up a task often means fixing the title and then putting it away, and that should be one step, not two. Ticking Archived still locks the fields and unticks Pinned, the same as the server, so the checkbox always behaves the same way.

**Completed tasks stay editable.** Completing is reversible, and correcting finished work is normal. Only archived tasks lock.

---

## New task and clone

**One dialog for new, clone and edit.** The form, its checks and the date rules are already built and tested for edit. New and clone are the same form with a different starting point and a POST instead of a PATCH. A second form would mean two sets of rules that can drift apart.

**Quick capture is the New task dialog with only the title filled.** New task, type, Enter. A separate always-visible capture box would be a second way to create a task with its own rules, for a saving of one click. Worth revisiting if he captures a lot on the move.

**Clone copies the work, not its state.** Title, description, priority, category, type and dates are copied. Status goes back to Not started, and Completed, Archived and the snooze start empty: the new copy hasn't been started. Pinned is copied: a pinned rhythm item stays pinned. The title is kept as is, with no "Copy of", because the Monday brief is still the Monday brief.

**New tasks land at the end of the full list.** The table is in id order, so a new task is on the last page. It shows in the scan straight away, which is where he'll look.

**Focus after closing a clone is deferred.** The native dialog returns focus to whatever opened it, but the Clone button is gone by the time the clone closes, so focus falls back to the page. Fixing it means finding the original title button in the page, more than keeping a task id in state, which is too much for the first cut.

**"New" for a task's first 24 hours.** A violet tag, a scan section after Tomorrow, and a Status filter option, so a fresh capture with no date is still visible and doesn't get added twice. The creation toast just confirms and fades; the tag and section do the remembering.

**Scan sections collapse.** The user can choose what to look at; all open by default, and the count stays visible when collapsed.

---

## Alerts, snooze and icons

**Due soon is amber, like a reached reminder.** Both mean "act on this soon", and red stays for overdue only. A third color would be one more thing to learn for the same message.

**Reminders win over due soon.** A task with a reminder only alerts when the reminder is reached: the user already chose when to be told. Due soon covers the tasks with no reminder, which would otherwise stay quiet until they're overdue. It also means a snooze always ends after the reminder, as the database requires.

**Icons back up the colors and cut the text.** A red or amber bell for an alert, a bell with a slash for snoozed, a green check for completed, the same in the scan, the table and the dialog. The icon replaces words like "Overdue · was due", so each scan line fits in two lines, and the bells line up in a column. The pin stays the 📌 emoji: pinned tasks are the most important ones, so the pin should stand out, and its red is a small glyph, not an alert tint.

**Snooze lives on the bell.** The answer to an alert is where the alert is: click the bell, pick how long. It saves at once, so it stays out of the edit dialog, where it would mix with unsaved edits.

**The dialog can end a snooze, not start one.** Ending a snooze only makes an alert louder, so it's safe in a form and is applied on Save. Starting one from a form is one click from quieting a sign-off for a month.

**A snooze never runs past the deadline.** A task snoozed before its deadline turns red the minute it goes overdue. That's the missed sign-off: it can't happen under a snooze. An overdue task can still be snoozed, by choice, and the snooze ends.

**Six snooze options: 30 minutes, 1, 3, 6, 8 hours, tomorrow morning.** Tomorrow morning is 07:00, not a number of hours, and "this morning" before 07:00. Each option shows when it ends.

**Alerting and Snoozed are Status filter options.** Like New, they sit in the Status dropdown, so the toolbar keeps two dropdowns.

**New is an icon, not a tag:** High, In progress and New side by side were too heavy; violet sparkles next to the title keeps 'violet means new' and reads at a glance.

---

## Caught up message and print

**Caught up means nothing open is due today or overdue, anywhere.** Pinned and snoozed tasks count too: an overdue sign-off that's pinned or snoozed is still overdue, and saying "caught up" over it is the missed sign-off again. Reminders and tomorrow's tasks don't block it; "today is clear" is about deadlines.

**Print one section at a time, as an index card.** A printer button on each scan section prints that section only, so the user can pick what goes on the card.

**The card is a 5 × 3 inch box on a normal page, not a card-sized page.** Any printer prints it at true size, and it can be trimmed. If the index-card size is needed, a card-sized page is a one-line change.

**On paper, flags are words, not colors.** Most printers are black and white, so overdue prints as "OVERDUE" and High as "!", with a box to tick by pen. A snoozed overdue task still prints as overdue; paper can't snooze.

---

## Wrap-up

**All 13 scope items made it in, print included.** The priority order held up, each part was usable before the next began, so stopping early would still have left a demo.
