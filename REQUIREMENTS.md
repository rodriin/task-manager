*STR Mission Applications · Full Stack Take-Home*

# First Cut for Maverick

## The situation

You're on a plane tomorrow. We ran a discovery call with a prospective user, Maverick, a Navy pilot who runs a detachment, and you're the engineer flying out to put our first cut in front of him. Not a finished product. A working first guess: here's what we heard, here's what we built, tell us where we're wrong.

The interview notes are in **Appendix A**. He rambles, he contradicts himself, and he doesn't know what he wants. He knows what hurts. There's no spec, and nobody is going to hand you one. **Build the thing you'd be willing to demo to him.**

Use whatever tools you want. Agents, copilots, whatever you'd reach for on a normal workday. What we care about is what you put in front of the customer, and that you can stand behind every part of it.

## Constraints

- **One command to run it.** We should be able to clone your repo and run `docker compose up` (or a single documented equivalent) and have the whole thing stand up, app and database included, on a machine with only Docker. If it doesn't run in one step, there's no demo.

- **Stack is your call.** Pick what lets you do good work fast and be ready to say why.

- **Don't spend more than three or four hours.** Not a rule we're grading, just the reality: the plane leaves either way, and the point is a first cut, not a finished product.

## Reach-back

You can email questions to your recruiting contact any time. No penalty for asking and none for not, but what you ask (or don't) is part of how we'll understand the way you work.

## What to submit

1. **The repo**, runnable as described above.

2. **PREBRIEF.md**, the one-pager you'd hand your account lead before the meeting. Cover:

   - What we heard: the customer's actual problem, in your words.

   - What we built and why.

   - What we're guessing on, and what we want to validate with Maverick in the room.

   - Where AI tooling helped, and where you overrode it.

   - This should be human-written.

3. **DECISIONS.md**, a running log of your thinking, updated as you build, not reconstructed at the end. What you considered, what you chose, why. No template, no length target, not optional: we read it to understand how you were thinking while you worked.

> These docs matter as much as the code. They're what we read first.

## How to submit & timeline

You'll have one week from the day you receive this. When you're done:

- Push to a private Git repository and add the reviewer handle your recruiting contact provides as a collaborator. If you'd rather, send a zipped archive of the repo (with git history intact) to your recruiting contact.

- Put PREBRIEF.md and DECISIONS.md at the repository root, alongside a short README with the one command to run it.

- Keep it local. Don't deploy anything or stand up cloud infrastructure; everything should run on a laptop with Docker and nothing else.

## What happens next

If the build is solid, we'll book a conversation, and it opens with: demo it to us like we're Maverick. Walk us through what you'd show him. Then we'll get into the calls you made, and what you'd do after he reacts. Come ready to talk about why, not just what.

## Appendix A: Notes from the discovery call

Raw notes from our call with Maverick. Lightly cleaned up, mostly not. This is what you're building from; everything before this page is just framing.

> Look, I fly. That part of my life is squared away. It's everything around the flying that's the problem. Running a det means I'm part pilot, part manager, part supply clerk, and my system for all of it is sticky notes, flags in my email, a whiteboard in the ready room, and my own memory. Four systems, none of them talk to each other, none of them work.
>
> So the first thing is, I want one place. I'm done splitting my brain across four spots. If it matters, it goes in the thing. Flight stuff, admin, the reminder to call the machine shop about the tow bar. One place, everything.
>
> The rhythm stuff kills me too. Monday morning brief, Friday status roll-up, the currency paperwork every quarter. Same items every time, I re-enter them by hand every time, and I still blow right past them.
>
> Last month I missed a maintenance sign-off. Not because I forgot, exactly. Because the requirement showed up in an email three weeks earlier and it never made it out of the email. That's how half my life arrives. Somebody grabs my shoulder on the flight line, says the thing's due Friday, and now it exists nowhere but my head. My head is full.
>
> But here's what happens with every app I've tried. I open it, it shows me two hundred items going back to the dawn of time, and I close the laptop. I'm not exaggerating. The second I'm looking at the whole pile, I'm done. So I don't know how to square that for you. I want everything in there, and I can't look at everything.
>
> And don't build me another thing that buzzes. I've turned off every notification on my phone. All of them. Everything's urgent, so nothing is. But then the stuff that actually burns me is the stuff that goes quiet, right? The sign-off didn't buzz. Nothing grabbed my collar until it was already late. So yeah. I hate being pinged and I keep getting burned by silence. You square that one too.
>
> In the jet, you don't stare at every gauge, you know. You scan. Instruments, horizon, traffic, back again. You always know what's now and what's next, and nothing sneaks up on you. On the ground I've got no scan. Everything sneaks up on me. If I'm honest that's the real problem.
>
> Sometimes I think the answer is the thing just prints me an index card every morning. Here's your day, here's what's coming at you. That's probably stupid. Something like that, though.
>
> There's a version of this someday where the squadron's in it too, hand a task to my WSO and so on. But day one I just need me squared away.
>
> I don't care what it looks like. I want to open it and feel like I'm ahead of the jet instead of behind it.
