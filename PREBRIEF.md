# Prebrief: First Cut for Maverick

## What I heard

- He is fine in the air flying the aircraft, the problem is everything else. He wears multiple user hats at any given time (pilot, manager, supply clerk).
- He has four systems today for task tracking. All are disconnected and not helpful (sticky notes, email flags, whiteboard, memory).
- His problem: on the ground he has no scan, in the jet he always knows what is now and next. This is the real ask.
- There is no easy way to track tasks. He misses deadlines not because he forgot, but because the task never made it out of the inbox and tracking by memory alone is not enough.
- The same tasks come round every week and quarter and he re-enters them by hand. These are repetitive tasks that he wishes were easily reproducible without the manual re-entry double work (Monday brief, Friday roll-up, quarterly paperwork).
- These are the two main contradictions he gave us to solve:
  - He wants everything in one place, but closes the laptop when shown everything.
  - He has turned off every notification, but gets burned when things go quiet.
- His idea to solve the problem: print an index card each morning with the daily tasks on it.
- Immediate need: the tool needs to work for just one user (him)
  - Print a small list of tasks to be done today
  - What matters most should be easy to spot (implied, not stated)
  - Needs to be functional, not pretty

## What I built and why

What the tool aims to address day-one:
- One place for every task, with a quick capture (only the title is required) so a task can be easily captured.
- Opens on Pinned, Today, Tomorrow, New and Reminders, not the full list. The whole pile is one click away and includes archived tasks, marked as archived, so nothing is ever lost. This is the answer to "everything in there, but I can't look at everything".
- Alerts appear inside the app for anything overdue, due soon, or past its reminder time, and keep showing until it's done, archived or snoozed. Nothing buzzes. Snooze quiets an alert but the task stays visible, marked as snoozed. This is the answer to "hate pings, burned by silence".
- Cloning a task is the initial answer to the repetitive (weekly and quarterly) items.
- The "You're caught up" message when today is clear gives the user the feeling of being ahead.
- Print today's tasks as an index card. Any scan section prints as well, one section at a time on one or more 5 × 3 inch cards.

Future features:
- Email integration for auto importing tasks with read/unread setting
- Auto generated recurring tasks
- Squadron-level task tracking and delegation
- Task approval for delegated tasks

## What I'm guessing on and what to validate

- **Is Today plus Tomorrow the right initial time window?** Or does "what's coming at you" mean the whole week?
- **Is cloning enough for the rhythm items**, or do you need them to be auto generated every Monday even if it is just its skeleton form?
- **Do in-app alerts still count as buzzing?** If so, does the ability to individually snooze each task help or would a snooze all button work better? The default snooze options are 30 minutes, 1, 3, 6 and 8 hours, and tomorrow morning. Do these help?
- **The index card:** do you want a printout on paper, or was that your way of saying keep the list short?
- **Where will you open this tool?** Ready room laptop, phone, both? Is there always good connectivity?
- **Capturing tasks is via typing.** A lot of tasks arrive by email or in person. Would you prefer to forward an email to the tool? Would you be typing on a phone?
- **Does priority mean anything to you?** "Everything's urgent, so nothing is."
- **Deadlines with a time of day:** is this useful, or do you prefer to keep it at the day-level?

## Where AI tooling helped, and where I overrode it

AI helped me:
- It caught a gap in my alert rule: as written, a task would stop alerting once its deadline passed, which is exactly the sign-off failure. Overdue tasks now keep alerting until completed, archived or snoozed.
- It pointed out that the server runs on UTC time, so in a US evening demo the app would show tomorrow’s tasks as today’s.
- It suggested creating the demo sample data using date offsets rather than the actual date value so the data would consistently showcase the intended use cases for the demo, no matter when the demo happens.
- It suggested the server unpin and clear the snooze when a task is archived, and clear the snooze when one is completed. Otherwise every screen would have to remember this or the database would reject the save.
- It pointed out that "caught up" can't just mean "the Today section is empty". A pinned overdue task sits in Pinned, and a snoozed overdue task is still overdue.

AI was wrong or I overrode it:
- It suggested creating a categories table now. I kept it as a plain column, because custom categories may be per user and I would be guessing too early.
- It proposed rejecting an edit that moves a deadline before its reminder. I wanted the deadline update to happen easily so I told it to recalculate and move the reminder with it.
- It had a database rule that completion must come after creation. I questioned it, and it was removed so past work could be logged.
- It made This week, This month and This quarter start at today. I made them whole calendar periods (Monday to Sunday, past days included), so the rhythm items would show whether they're coming, are overdue or are done.
- It first advised against using TanStack Table and to use a migration tool, then reversed both when I pushed on timeline and on what I planned to build next.
