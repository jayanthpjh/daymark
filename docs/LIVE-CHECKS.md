# Live checks you run yourself

Three things were built and tested only against synthetic pages and fake mail. Each check below touches something real, so you run it. None of them submits an application. Do them in this order; each one takes 10 to 15 minutes.

## Before any check

1. Start Docker, then the database, then Daymark:
   ```bash
   open -a Docker
   npm run infra:up
   npm start
   ```
   If Docker stops later, PostgreSQL goes with it. Calendar and mail need PostgreSQL.
2. Open the app (the address `npm start` prints). In **System**, confirm Proton Bridge shows connected.
3. In **System** (or Settings), confirm **Review before submit** is on and **Auto-apply** is off. Both are the defaults.
4. Make sure the Docker worker container is not also running (`npm run worker:down`). Only one worker may run.

---

## Check 1: a real calendar invite from real mail

**Goal:** an invite that arrives in your Proton inbox appears on the Calendar, and a reply goes out only after you review it.

1. From another account (Gmail or Outlook), create a calendar event tomorrow, 30 minutes, with a video link, and invite your Proton application address. Title it something like `Test interview - Daymark`.
2. In Daymark, open **Mail** and press sync, or wait up to 60 seconds.
3. Open **Calendar**. The event should be on the agenda with the right local time, kind (Interview or Screening, read from the title) and the join link.
   - Wrong time by a few hours: that is a timezone bug. Note the zone shown in the original invite.
4. Open the event and press **Accept**. You should see "Reply saved as a draft. Nothing was sent."
5. Open **Mail > Drafts**. The draft is addressed to the organizer with subject `Accepted: ...`. Open it and press **Review**, check the preview says it includes a calendar reply, then **Send**.
6. On the other account the invite should now show you as accepted.
7. Back in Daymark the event shows **Accepted**. Cancel the event from the other account and sync again: it should show **Cancelled** and the Accept buttons disappear.

**Pass:** steps 3, 4 (nothing sent), 6 (reply received as an RSVP, not plain text) and 7.
**Report back if:** the event never appears (tell me the sender service), the time is wrong, the reply arrives as a plain email with no accept status, or Review refuses with "different address" (your sending address and the address the invite used differ).

---

## Check 2: the consent tick on a real form

**Goal:** a consent checkbox is ticked only by your answer on the Questions card, and Daymark verifies it afterwards.

Use a posting on **Greenhouse, Lever or Ashby** whose form has a consent or SMS checkbox (the Eve form that caused the earlier problem is a good one). Use a job you would not mind applying to; you will stop before submitting.

1. In **Discover** or **Applications**, start the application for that job. Let Daymark prepare the resume and fill the form.
2. When it pauses, open **Questions**. The consent line shows as a **Yes / No card**. Daymark never picks it for you.
3. Choose your answer and send it.
4. Watch the application in **Applications > the job > Live**. Daymark should tick or leave the box, then re-read the form.
5. Confirm on the form itself (use **Resolve this step** to open it in Chrome if you want to see it) that the box matches your answer.
6. Continue until it reaches **final review**, then stop. Do not press Submit. Use **Not now** or park the application.

**Pass:** the box matches your answer, no other consent box was touched, and the run reached review without asking you again.
**Report back if:** the box was ticked when you chose No (or the reverse), the card never appeared, or the run looped on the same step.

---

## Check 3: one live fill, stopping at review

**Goal:** an ordinary application fills end to end on a real employer form and stops for you.

1. Pick a **Greenhouse** posting first (the most tested). Start the application.
2. Watch **Live**. Expect: preparing documents, signing in or guest, filling, **Needs your answer** for anything unknown, then **Awaiting your review**.
3. Answer any Questions cards. Dropdown questions should list the real options.
4. At review, open the answers list. Try **editing one answer** there: it should re-check the form and come back to review, and the earlier approval should clear.
5. Check the attached resume is the one you approved (open the PDF from Materials). If you chose the Jake template, it should look like the LaTeX layout.
6. Stop. Do not submit. Park or cancel the application.

Repeat once on **Workday** (the hardest). Expect the longest run and a possible sign-in step.

**Pass:** it reaches review on both, answers match your profile, the resume attachment is accepted, and nothing was submitted.
**Report back if:** it stalls on a step (tell me the step name and the employer), fills a wrong value, shows an unknown field as filled, or the attachment is rejected.

---

## What to send me after each check

- Which check, which employer or service.
- The result: pass, or the exact screen and message where it stopped.
- If a task ended up in a bad state, its id (shown in the application page URL) so I can read its activity log.

Anything that was submitted by mistake is recorded under that application's receipt. Tell me straight away and I will read what was sent.
