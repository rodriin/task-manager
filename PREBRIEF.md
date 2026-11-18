# Prebrief: First Cut for Maverick

## What I heard

Key takeaways:

- He is fine in the air flying the aircraft, the problem is everything else. He wears multiple user hats at any given time.
  - pilot
  - manager
  - supply clerk
- He has four disconnected systems today for task tracking. All are independent from each other and are not helpful.
  - sticky notes
  - email flags
  - whiteboard
  - memory
- His own description of the problem: on the ground he has no scan, in the jet he always knows what is now and what is next. This is the real ask, he needs a simplified way of knowing what to do next and when things are due so he can be ahead of deadlines. Ideally, he should be able to tell right away what is important at a quick glance.
- There is no easy way to track tasks. Things can arrive in an email three weeks before they are due without a reminder, so he does not find out until it is too late and only because someone reminded him when it is due. He misses deadlines not because he forgot, but because the task never made it out of the inbox and he relied on his own memory to keep track but he is tracking way too much by memory.
- The same tasks come round every week and quarter and he re-enters them by hand. These are repetitive tasks that he wishes were easily reproducible without the manual re-entry double work.
  - Monday morning brief
  - Friday status roll-up
  - Quarterly currency paperwork
- He does not like to have too many things alerting/pinging him. This only makes him more desensitized to alerts and actually makes him treat it as noise, so he silences them all. There needs to be a clear definition for urgent with non-invasive reminders, so things like sign-offs can properly alert and catch his attention without getting fully silenced.
- He does not want an overwhelmingly long list of tasks but he wants to be able to look at anything from the past. Ideally he wants to be looking at a small subset of tasks, like today's tasks, or tomorrow's tasks, or this week's tasks with the ability to pull up a task from 3 months ago.
- These are the two main contradictions he gave us to solve:
  - He wants everything in one place, but closes the laptop when shown everything.
  - He has turned off every notification, but gets burned when things go quiet.
- His proposed initial idea to solve the problem: print an index card each morning with the daily tasks on it.
- Immediate need: the tool needs to work for just one user (him)
  - Print a small list of tasks to be done today
  - What matters most should be easy to spot (implied, not stated)
  - Needs to be functional, not pretty
- Future wants: include the squadron in the tool
  - Add squadron users to the tool
  - Delegate tasks to the squadron users
  - Keep track of the squadron progress (implied, not stated)
- Does not care how it looks, just wants the tool to help him feel ahead of the game, not just playing last minute catch-up as always.

## What I built and why

What the tool aims to address day-one:

- One place for every task, with a one-field quick capture (title only) so a task can be captured in seconds.
- Opens on Pinned, Today, Tomorrow and Reminders, not the full list. The whole pile is one click away and includes archived tasks, marked as archived, so nothing is ever lost. This is the answer to "everything in there, but I can't look at everything".
- Alerts appear inside the app for anything overdue, due soon, or past its reminder time, and keep showing until it's done, archived or snoozed. Nothing buzzes. Snooze quiets an alert but the task stays visible, marked as snoozed. This is the answer to "hate pings, burned by silence".
- Overdue is calculated from the deadline, so nothing has to be marked late by hand and there are no data inconsistencies between deadline and overdue caused by data manipulation.
- Clone a task is the initial answer to the repetitive (weekly and quarterly) items.
- The "You're caught up" message when today is clear, gives the user the feeling of being ahead.
- Types include Sign-off and Recurring, taken straight from his examples.
- Print today's list as the index card (if time allows).
- Sample data is made to fit the example: tow bar, phase inspection sign-off, det brief, roll-up, currency paperwork.

Initial features:

- Today and tomorrow tasks list views
- Full task list (all-inclusive) with the minimum useful information per row
- Task detail and edit modal
- Task cloning
- Alerts for tasks due today or very soon
- Alert snoozing
- Feel good "You're caught up" message when today is clear
- Pin tasks to the top of the today view
- Pagination
- Sort
- Filtering
- Search
- If time allows (bonus points):
  - Print today's tasks

Future features:

- Email integration for auto importing tasks with read/unread setting
- Add conditional email and/or text alerts
- Task templates for repeated tasks
- Display tasks as tiles in a tile view
- Allow a custom pagination limit for the table and tile views
- Support dark mode
- Add internationalization (i18n)
- Build a native mobile app, especially if offline access is needed
- AI integration for task data augmentation and/or creation
- Voice capture capabilities for task creation
- Squadron-level task tracking
- Task delegation to squadron
- Task approval for delegated tasks
- Custom task groupings
- Support task dependency (a task depends on one or more tasks)
- Custom task flags or categories, potentially on a per user basis
- Notes or comments as a timestamped list of task activities
- Bulk updates (i.e. completing, archiving, reassigning multiple tasks)
- Persisted filtering across multiple views

Future stack changes (as product matures):

- Server-side sorting, filtering, search and pagination: once the dataset grows
- Migration tool: needed before the next schema changes
- React Router: when the app needs shareable URLs or a working back button
- Login and auth: needed for adding the squadron or going beyond a single user
- Zustand: might be needed for bulk updates and persisted filtering

The initial data schema includes a users and tasks table. Although the first cut is for a single user, the minute we need to add a second user we will need the users table. Hence that has been done upfront and it has near zero cost now vs later.

## What I'm guessing on and what to validate

Assumptions and open questions:

- **Is Today plus Tomorrow the right initial time window?** Or does "what's coming at you" mean the whole week?
- **Is cloning enough for the rhythm items**, or do you need them to be auto generated every Monday even if it is just its skeleton form?
- **Do in-app alerts count as "another thing that buzzes"?** If so, does the ability to individually snooze each task help or would a snooze all button work better?
- **Automatic alerts:** will show in the app for tasks that are overdue, due within 24 hours, or past the reminder time set. Does this feel reasonable?
- **Snooze lengths.** Three hours and tomorrow morning are guesses.
- **Capturing tasks is via typing.** A lot of tasks arrive by email or in person. Would you prefer to forward an email to the tool? Would you be typing on a phone?
- **Categories** (Admin, Supply, Flight, Personal): are these enough or are there others that should be added?
- **Does priority mean anything to you?** "Everything's urgent, so nothing is."
- **The index card:** do you want a printout on paper, or was that your way of saying keep the list short?
- **Where will you open this tool?** Ready room laptop, phone, both? Is there always good connectivity?
- **Deadlines with a time of day:** is this useful, or do you prefer to keep it at the day-level?
- **Is archiving a task useful?** Do you prefer to clean out old or incomplete tasks by archiving them or would you rather leave them be?
- **The scan and task order.** The first cut puts Pinned tasks first as its own section, and Today is overdue first, then by deadline just like Tomorrow. Then there is the Reminders section. Is that the right order for you? Do you want to add a Week section or any other section to the scan view?
- **The default due time is 20:00.** Is that the right default due time?
- **Untriggered reminders are not included in the Scan.** Should a reminder that hasn't gone off yet stay hidden from the scan?
- **Full-list order:** tasks appear in the order they were entered. Should the inital sort be different?
- **Filters:** are Status and Deadline enough, or do you want dropdowns for category, priority, pinned or "has a reminder"?
- **Week and quarter:** does your week start on Monday? Do calendar quarters match how you think about quarterly paperwork? They line up with the federal fiscal quarters.
- **Rows per page:** is 10 the right amount to have by default?
- **Is it fine that there's no "discard changes?"** prompt when closing an edited task?
- **Are Complete and Archive as checkboxes in the edit form enough,** or do you want one-click buttons on the rows?

## Where AI tooling helped, and where I overrode it

AI helped me:

- Generated the sample task data from the interview notes and updated the data while figuring out the initial schema.
- Reviewed the data model: suggested deriving overdue instead of storing it and pointed out that pinning and snoozing had nowhere to be stored.
- It pointed out that the server runs on UTC time, so in a US evening demo the app would show tomorrow’s tasks as today’s.
- It suggested creating the demo sample data using date offsets rather than the actual date value so the data would consistently showcase the intended use cases for the demo, no matter when the demo happens.
- Wrote the reference schema with database checks and verified the sample data against it.
- Scaffolded the Docker setup and the project commands.
- It wrote a CLAUDE.md, a project instructions file for the AI coding agent. After I added the requirements doc, it also captured the brief's constraints there: the one-command run, the time box, that PREBRIEF must be human-written, and that DECISIONS is a running log.
- It caught a gap in my alert rule: as written, a task would stop alerting once its deadline passed, which is exactly the sign-off failure. Overdue tasks now keep alerting until completed, archived or snoozed.
- It copied every check and the partial index from schema.sql into the models, so the rules actually exist in the running database. It also checked the seed against them, including on both daylight-saving change days.
- It suggested the server unpin and clear the snooze when a task is archived, and clear the snooze when one is completed. Otherwise every screen would have to remember this or the database would reject the save.
- It built the All tasks table with search, filters, sorting and pages in the browser.
- It flagged that with a deadline sort as the default, the full table view would opened on a page of grey archived tasks.
- It added a lot of the missing accessibility once I flag that some was missing.

I overrode or corrected AI:

- It suggested creating a categories table now. I kept it as a plain column, because custom categories may be per user and I would be guessing too early.
- It proposed rejecting an edit that moves a deadline before its reminder. I wanted the deadline update to easily happen; we settled on recalculating and moving the reminder with it.
- It had a database rule that completion must come after creation. I questioned it, and it was removed so past work could be logged.
- The Personal category, renaming Managerial to Admin, the preferred name field and making Completed a calculated value were my calls.
- It first advised against using TanStack Table and to use a migration tool, then reversed both when I pushed on timeline and on what I planned to build next.
- The scan layout was my call:
  - a Pinned section above Today
  - a Reminders section below Tomorrow
  - only reminders that have already gone off appear
  - amber for reminders, red for overdue
- I chose 20:00 as the default due time, because 20:00 Eastern is still the workday in Pacific time. I also chose the 24-hour clock.
- It ran Prettier with its default style and I asked it to revert those changes and add settings to use single quotes and less semicolons.
- I rejected its folder names three times: lib/, views/ (a file named TaskView sounded like a React view), and API calls split into three files. I chose helpers/, components/ and a single api/client.ts.
- It made This week, This month and This quarter start at today. I made them whole calendar periods (Monday to Sunday, past days included), so the weekly roll-up and quarterly paperwork show whether they're coming, overdue or done. It had "Later" as after this week; I made it after this quarter.
- It suggested defaulting the Status filter to Open. I chose not to do that so there is no missing data.
- I decided to have pinned tasks as ordinary rows in the full list, since the scan already has a Pinned section. This also made it possible to have a sortable Pin column.
- I decided archived tasks stay in the full list, with archiving done as a normal edit, so nothing would be missing from the full table data and the Status filter can hide archived tasks as needed.
- It proposed moving the reminder to 07:00 on the deadline's day, or to the deadline itself if earlier. I chose the day before the deadline at the reminder's original time: one rule, and at least a day to act.

AI was wrong or inconsistent:

- Its install commands missed a peer dependency, which broke the first Docker build.
- Its sample data had a task snoozed until the same moment its reminder fired; the new database check caught it.
- Military details in the sample data are plausible but generic. I reviewed them by hand and updated them to the best of my knowledge.
- I asked whether a reminder required a deadline. The schema already allowed a reminder on its own, but the AI's own summary in CLAUDE.md was worded ambiguously enough to suggest otherwise. I made it fix the wording.
- It gave a plain utility file a name that read like a React component.
- When writing the All tasks plan, it said the seed had no archived tasks because it searched for the wrong field name. There are 13.
- Its date filters started at today, which hid rhythm items that were already done or overdue this week.
- Its first click on a number column sorted descending, so "sort by Pin" put pinned tasks last.
- Its first default sort opened the full list on old archived tasks.
- It wanted to block Save when a first deadline is added before an existing reminder. That breaks the intent that moving a deadline should never reject the edit when the reminder can be easily recalculated.
